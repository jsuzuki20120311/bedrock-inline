import * as vscode from 'vscode';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { CompletionSettings } from '../models/CompletionSettings';
import { FEATURE_STATE_KEY } from '../constants';


export class AmazonBedrockInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {

  private readonly DEBOUNCE_DELAY = 250;

  private readonly MAX_PREFIX_LINES = 120;
  private readonly MAX_SUFFIX_LINES = 80;
  private readonly MAX_PREFIX_CHARS = 4000;
  private readonly MAX_SUFFIX_CHARS = 2000;

  private readonly context: vscode.ExtensionContext;

  private debounceTimer: NodeJS.Timeout | undefined;

  private pendingDebounceResolve: ((value: boolean) => void) | undefined;

  private pendingDebounceCancellation: vscode.Disposable | undefined;

  private cachedClient: BedrockRuntimeClient | undefined;

  private cachedClientKey: string | undefined;

  private onChange: (isLoading: boolean) => void;

  private readonly getCredentials: () => Promise<Pick<CompletionSettings, 'accessKeyId' | 'secretAccessKey'>>;

  constructor(
    context: vscode.ExtensionContext,
    onChange: (isLoading: boolean) => void,
    getCredentials: () => Promise<Pick<CompletionSettings, 'accessKeyId' | 'secretAccessKey'>>,
  ) {
    this.context = context;
    this.onChange = onChange;
    this.getCredentials = getCredentials;
  }

  private async getCompletionSettings(): Promise<CompletionSettings> {
    const configuration = vscode.workspace.getConfiguration('bedrockInline');
    const credentials = await this.getCredentials();

    return {
      region: configuration.get<string>('region', 'ap-northeast-1').trim(),
      profile: configuration.get<string>('profile', '').trim(),
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      modelId: configuration.get<string>('modelId', 'qwen.qwen3-coder-30b-a3b-v1:0').trim(),
      temperature: configuration.get<number>('temperature', 0.1),
      topP: configuration.get<number>('topP', 0.9),
      maxTokens: configuration.get<number>('maxTokens', 256),
    };
  };

  private buildContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): { prefix: string; suffix: string } {
    const prefixStartLine = Math.max(0, position.line - this.MAX_PREFIX_LINES);
    const prefixRange = new vscode.Range(new vscode.Position(prefixStartLine, 0), position);
    let prefix = document.getText(prefixRange);
    if (prefix.length > this.MAX_PREFIX_CHARS) {
      prefix = prefix.slice(-this.MAX_PREFIX_CHARS);
    }

    const suffixEndLine = Math.min(document.lineCount - 1, position.line + this.MAX_SUFFIX_LINES);
    const suffixEndPosition = new vscode.Position(
      suffixEndLine,
      document.lineAt(suffixEndLine).text.length,
    );
    const suffixRange = new vscode.Range(position, suffixEndPosition);
    let suffix = document.getText(suffixRange);
    if (suffix.length > this.MAX_SUFFIX_CHARS) {
      suffix = suffix.slice(0, this.MAX_SUFFIX_CHARS);
    }

    return { prefix, suffix };
  }

  private removeSuffixOverlap(suggestion: string, suffix: string): string {
    if (!suggestion || !suffix) {
      return suggestion;
    }

    const maxOverlap = Math.min(suggestion.length, suffix.length);
    for (let overlap = maxOverlap; overlap > 0; overlap--) {
      if (suggestion.endsWith(suffix.slice(0, overlap))) {
        return suggestion.slice(0, suggestion.length - overlap);
      }
    }

    return suggestion;
  }

  private normalizeSuggestion(raw: string, suffix: string): string {
    if (!raw) {
      return '';
    }

    let suggestion = raw.replace(/\r\n?/g, '\n');

    // Models occasionally wrap output in fenced code blocks.
    suggestion = suggestion.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
    suggestion = suggestion.replace(/\n?```\s*$/, '');

    suggestion = this.removeSuffixOverlap(suggestion, suffix);

    return suggestion;
  }

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
    this.onChange(true);

    const settings = await this.getCompletionSettings();
    const client = this.getBedrockRuntimeClient(settings);

    const abortController = new AbortController();
    const cancellation = token?.onCancellationRequested(() => {
      return abortController.abort();
    });

    const systemPrompt = `You are an expert code completion engine embedded in a code editor. Your sole task is Fill-In-the-Middle (FIM): given code before and after the cursor, return only the text that should be inserted at the cursor.

Strict output rules:
1. Output ONLY the completion text — no explanations, no markdown fences, no apologies.
2. Prefer a single-line completion. Output multiple lines only if required by syntax.
3. Do NOT repeat text already present in the suffix. Connect seamlessly.
4. Match the surrounding style exactly (indentation, quotes, semicolons, naming conventions).
5. Complete the immediate intent near the cursor. Avoid unrelated refactors or comments.
6. If no useful completion is possible, output an empty string.

Language-specific guidance:
- For TypeScript/JavaScript, prioritize type-safe and compile-ready code.
- Keep completions concise and locally relevant.`;

    const userPrompt = `Language: ${languageId}

Complete at the cursor between <prefix> and <suffix>.

Rules:
- Return only insertion text.
- Do not include text that already appears at the start of <suffix>.
- Prefer minimal completion that keeps code valid.

<prefix>
${prefix}
</prefix>

<suffix>
${suffix}
</suffix>`;

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
          temperature: settings.temperature,
          topP: settings.topP,
        }
      };

      const command = new ConverseCommand(input);
      const response = await client.send(command, { abortSignal: abortController.signal });

      const textContent = this.findResultText(response.output?.message?.content);

      const normalized = this.normalizeSuggestion(textContent, suffix);
      console.log('Normalized suggestion: ', normalized);
      return normalized;

    } catch (error) {
      // ユーザーによるキャンセル（abort）の場合は空文字を返すなど、VS Codeプラグイン向けの制御
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('AbortError: ', error);
        return "";
      }

      console.error('Error fetching suggestion: ', error);
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

    const { prefix, suffix } = this.buildContext(document, position);

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
