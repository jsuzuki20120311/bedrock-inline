import * as vscode from 'vscode';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { CompletionSettings } from '../models/CompletionSettings';
import { FEATURE_STATE_KEY } from '../constants';


export class AmazonBedrockInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {

  private readonly DEBOUNCE_DELAY = 250;

  private readonly context: vscode.ExtensionContext;

  private debounceTimer: NodeJS.Timeout | undefined;

  private pendingDebounceResolve: ((value: boolean) => void) | undefined;

  private pendingDebounceCancellation: vscode.Disposable | undefined;

  private cachedClient: BedrockRuntimeClient | undefined;

  private cachedClientKey: string | undefined;

  private onChange: (isLoading: boolean) => void;

  constructor(context: vscode.ExtensionContext, onChange: (isLoading: boolean) => void) {
    this.context = context;
    this.onChange = onChange;
  }

  private getCompletionSettings(): CompletionSettings {
    const configuration = vscode.workspace.getConfiguration('bedrockInline');
    return {
      region: configuration.get<string>('region', 'ap-northeast-1').trim(),
      profile: configuration.get<string>('profile', '').trim(),
      accessKeyId: configuration.get<string>('accessKeyId', '').trim(),
      secretAccessKey: configuration.get<string>('secretAccessKey', '').trim(),
      modelId: configuration.get<string>('modelId', 'qwen.qwen3-coder-30b-a3b-v1:0').trim(),
      temperature: configuration.get<number>('temperature', 0),
      maxTokens: configuration.get<number>('maxTokens', 2000),
    };
  };

private waitDebounce(token: vscode.CancellationToken): Promise<boolean> {
  if (token.isCancellationRequested) {
    return Promise.resolve(false);
  }

  if (this.debounceTimer) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
  }

  this.pendingDebounceCancellation?.dispose();
  this.pendingDebounceResolve?.(false);

  return new Promise<boolean>((resolve) => {
    this.pendingDebounceResolve = resolve;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.pendingDebounceCancellation?.dispose();
      this.pendingDebounceCancellation = undefined;
      this.pendingDebounceResolve = undefined;
      resolve(true);
    }, this.DEBOUNCE_DELAY);

    this.pendingDebounceCancellation = token.onCancellationRequested(() => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }
      this.pendingDebounceCancellation?.dispose();
      this.pendingDebounceCancellation = undefined;
      this.pendingDebounceResolve = undefined;
      resolve(false);
    });
  });
}

  private getClientCacheKey(settings: CompletionSettings): string {
    return JSON.stringify({
      region: settings.region,
      profile: settings.profile,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    });
  }

  private getBedrockRuntimeClient(settings: CompletionSettings): BedrockRuntimeClient {
    const cacheKey = this.getClientCacheKey(settings);
    if (this.cachedClient && this.cachedClientKey === cacheKey) {
      return this.cachedClient;
    }

    this.cachedClient = this.createBedrockRuntimeClient(settings);
    this.cachedClientKey = cacheKey;
    return this.cachedClient;
  }

  private createBedrockRuntimeClient(settings: CompletionSettings): BedrockRuntimeClient {
    if (settings.accessKeyId && settings.secretAccessKey) {
      return new BedrockRuntimeClient({
        region: settings.region,
        credentials: {
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
        },
      });
    }
  
    if (settings.profile) {
      return new BedrockRuntimeClient({
        region: settings.region,
        credentials: fromIni({ profile: settings.profile }),
      });
    }
  
    return new BedrockRuntimeClient({
      region: settings.region
    });
  }
  

  private findResultText(content: { text?: string }[] | undefined): string {
    if (!content) {
      return '';
    }

    const resultContent = content.find((item) => {
      return typeof item.text === 'string';
    });
    if (!resultContent || !resultContent.text) {
      return '';
    }
    return resultContent.text;

  }

  async fetchNextSuggestion(prefix: string, suffix: string, languageId: string, token?: vscode.CancellationToken): Promise<string> {
    console.log("fetchNextSuggestion!");

    this.onChange(true);

    const settings = this.getCompletionSettings();
    const client = this.getBedrockRuntimeClient(settings);

    const abortController = new AbortController();
    const cancellation = token?.onCancellationRequested(() => {
      return abortController.abort();
    });

    const systemPrompt = `You are an expert code completion engine embedded in a code editor. Your sole task is Fill-In-the-Middle (FIM): given the code immediately before and after the cursor, produce the exact text to insert at the cursor so that the file reads naturally and correctly.

Strict output rules:
1. Output ONLY the completion text — no explanations, no markdown fences, no apologies.
2. Do NOT repeat any text already present in the suffix; your output must connect seamlessly to it.
3. Preserve the indentation style and conventions of the surrounding code.
4. Output multiple lines only when the context clearly requires it (e.g. closing a multi-line block).
5. If no completion is needed, output an empty string and nothing else.`;

    const userPrompt = `Language: ${languageId}

<prefix>
${prefix}
</prefix>
<suffix>
${suffix}
</suffix>

Insert the completion at the cursor position (between prefix and suffix).`;

    try {
      const input: ConverseCommandInput = {
        modelId: settings.modelId,
        system: [
          {
              text: systemPrompt
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                text: userPrompt
              }
            ]
          }
        ],
        inferenceConfig: {
          maxTokens: settings.maxTokens,
          temperature: settings.temperature
        }
      };

      const command = new ConverseCommand(input);
      const response = await client.send(command, { abortSignal: abortController.signal });

      const textContent = this.findResultText(response.output?.message?.content);
      return textContent;

    } catch (error) {
      // ユーザーによるキャンセル（abort）の場合は空文字を返すなど、VS Codeプラグイン向けの制御
      if (error instanceof Error && error.name === 'AbortError') {
        return "";
      }
      throw error;
    } finally {
      cancellation?.dispose();
      this.onChange(false);
    }
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {

    const isFeatureEnabled = this.context.globalState.get<boolean>(FEATURE_STATE_KEY, false);

    if (!isFeatureEnabled) {
      return [];
    }

    const prefixRange = new vscode.Range(new vscode.Position(0, 0), position);
    let prefix = document.getText(prefixRange);
    if (prefix.length > 2000) {
      prefix = prefix.slice(-2000);
    }

    const suffixRange = new vscode.Range(position, new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length));
    let suffix = document.getText(suffixRange);
    if (suffix.length > 2000) {
      suffix = suffix.slice(0, 2000);
    }

    if (!prefix.trim() && !suffix.trim()) {
      return [];
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    const shouldFetch = await this.waitDebounce(token);
    if (!shouldFetch || token.isCancellationRequested) {
      return [];
    }

    try {
      const suggestion = await this.fetchNextSuggestion(prefix, suffix, document.languageId, token);
      if (!suggestion) {
        return [];
      }
      return [{
        insertText: suggestion,
        range: new vscode.Range(position, position),
      }];
    } catch (error) {
      console.error('ERROR: ', error);
      return [];
    } finally {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }
    }
  }
}
