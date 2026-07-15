import * as vscode from 'vscode';
import { BedrockRuntimeClient, ConverseCommand, ConverseCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';
import { CompletionSettings } from '../models/CompletionSettings';
import { FEATURE_STATE_KEY } from '../constants';


export class AmazonBedrockInlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {

  private readonly DEBOUNCE_DELAY = 350;

  private readonly context: vscode.ExtensionContext;

  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private getCompletionSettings(): CompletionSettings {
    const configuration = vscode.workspace.getConfiguration('bedrockInline');
    return {
      region: configuration.get<string>('region', 'ap-northeast-1').trim(),
      profile: configuration.get<string>('profile', '').trim(),
      accessKeyId: configuration.get<string>('accessKeyId', '').trim(),
      secretAccessKey: configuration.get<string>('secretAccessKey', '').trim(),
      modelId: configuration.get<string>('modelId', 'openai.gpt-oss-20b').trim(),
      temperature: configuration.get<number>('temperature', 0.2),
      maxTokens: configuration.get<number>('maxTokens', 200),
      systemPrompt: configuration.get<string>('systemPrompt', 'You are a code completion assistant.Output ONLY the immediate next line of code that continues the prefix.Do NOT generate multiple lines. Do NOT write any explanations, wrap in markdown, or output a newline character.').trim(),
    };
  };

  private waitDebounce(token: vscode.CancellationToken): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        resolve(true); 
      }, this.DEBOUNCE_DELAY);

      // 待機中に VS Code 側からキャンセルが来たら即座に解除して false を返す
      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = undefined;
        }
        resolve(false);
      });
    });
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
  
  async fetchNextSuggestion(prefix: string, token?: vscode.CancellationToken): Promise<string> {
    console.log('fetchNextSuggestion called with prefix:', prefix);

    const settings = this.getCompletionSettings();
    const client = this.createBedrockRuntimeClient(settings);

    const abortController = new AbortController();
    const cancellation = token?.onCancellationRequested(() => {
      return abortController.abort();
    });

    try {
      const input: ConverseCommandInput = {
        modelId: settings.modelId,
        messages: [
          {
            role: "user",
            content: [{ text: prefix }]
          }
        ],
        inferenceConfig: {
          maxTokens: settings.maxTokens,
          temperature: settings.temperature
        }
      };

      // systemPromptが空のときにそのまま送信するとエラーとなる場合があるので、空文字でない場合のみ設定する。
      if (settings.systemPrompt) {
        input.system = [
          {
            text: settings.systemPrompt
          }
        ];
      }

      const command = new ConverseCommand(input);
      const response = await client.send(command, { abortSignal: abortController.signal });

      const textContent = response.output?.message?.content?.[0]?.text;

      console.log('fetchNextSuggestion response:', textContent);
      return textContent ?? "";

    } catch (error) {
      // ユーザーによるキャンセル（abort）の場合は空文字を返すなど、VS Codeプラグイン向けの制御
      if (error instanceof Error && error.name === 'AbortError') {
        return "";
      }
      throw error;
    } finally {
      cancellation?.dispose();
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
    // Limit prefix to maximum 2000 characters
    if (prefix.length > 2000) {
      prefix = prefix.slice(-2000);
    }
    if (!prefix.trim()) {
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
      const suggestion = await this.fetchNextSuggestion(prefix, token);
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
