import * as vscode from 'vscode';
import { AmazonBedrockInlineCompletionItemProvider } from './providers/AmazonBedrockInlineCompletionItemProvider';
import { FEATURE_STATE_KEY } from './constants';


let statusBarItem: vscode.StatusBarItem | undefined;


function updateStatusBarItem(newFeatureState: boolean): void {
  if (!statusBarItem) {
    return;
  }
  if (newFeatureState) {
    statusBarItem.text = '$(pass) Bedrock Inline: ON';
    statusBarItem.tooltip = 'Click to turn Bedrock Inline off.';
  } else {
    statusBarItem.text = '$(circle-slash) Bedrock Inline: OFF';
    statusBarItem.tooltip = 'Click to turn Bedrock Inline on.';
  }
  statusBarItem.backgroundColor = undefined;
}


export function activate(context: vscode.ExtensionContext) {

  const handleToggleFeatureEnabled = async () => {
    const featureState = context.globalState.get<boolean>(FEATURE_STATE_KEY, false);
    const newFeatureState = !featureState;
    await context.globalState.update(FEATURE_STATE_KEY, newFeatureState);
    updateStatusBarItem(newFeatureState);
  };

  const toggleDisposable = vscode.commands.registerCommand('bedrockInline.toggleNextSuggestion', handleToggleFeatureEnabled);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.command = 'bedrockInline.toggleNextSuggestion';
  context.subscriptions.push(statusBarItem);

  const featureState = context.globalState.get<boolean>(FEATURE_STATE_KEY, false);
  updateStatusBarItem(featureState);
  statusBarItem.show();
  context.subscriptions.push(toggleDisposable);

  const amazonBedrockInlineCompletionItemProvider = new AmazonBedrockInlineCompletionItemProvider(context);
  const amazonBedrockInlineCompletionItemProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    amazonBedrockInlineCompletionItemProvider
  );
  context.subscriptions.push(amazonBedrockInlineCompletionItemProviderDisposable);
}

export function deactivate() {
  statusBarItem?.dispose();
  statusBarItem = undefined;
}
