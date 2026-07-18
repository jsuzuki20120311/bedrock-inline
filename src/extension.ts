import * as vscode from 'vscode';
import { AmazonBedrockInlineCompletionItemProvider } from './providers/AmazonBedrockInlineCompletionItemProvider';
import {
  ACCESS_KEY_ID_SECRET_KEY,
  FEATURE_STATE_KEY,
  SECRET_ACCESS_KEY_SECRET_KEY,
} from './constants';


let statusBarItem: vscode.StatusBarItem | undefined;

type StoredCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

async function getStoredCredentials(context: vscode.ExtensionContext): Promise<StoredCredentials> {
  const [accessKeyId, secretAccessKey] = await Promise.all([
    context.secrets.get(ACCESS_KEY_ID_SECRET_KEY),
    context.secrets.get(SECRET_ACCESS_KEY_SECRET_KEY),
  ]);

  return {
    accessKeyId: accessKeyId?.trim() ?? '',
    secretAccessKey: secretAccessKey?.trim() ?? '',
  };
}

async function clearLegacyConfigurationCredentials(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('bedrockInline');
  const accessKeyId = configuration.inspect<string>('accessKeyId');
  const secretAccessKey = configuration.inspect<string>('secretAccessKey');

  if (accessKeyId?.globalValue !== undefined || secretAccessKey?.globalValue !== undefined) {
    await Promise.all([
      configuration.update('accessKeyId', undefined, vscode.ConfigurationTarget.Global),
      configuration.update('secretAccessKey', undefined, vscode.ConfigurationTarget.Global),
    ]);
  }

  if (accessKeyId?.workspaceValue !== undefined || secretAccessKey?.workspaceValue !== undefined) {
    await Promise.all([
      configuration.update('accessKeyId', undefined, vscode.ConfigurationTarget.Workspace),
      configuration.update('secretAccessKey', undefined, vscode.ConfigurationTarget.Workspace),
    ]);
  }

  if (accessKeyId?.workspaceFolderValue !== undefined || secretAccessKey?.workspaceFolderValue !== undefined) {
    await Promise.all([
      configuration.update('accessKeyId', undefined, vscode.ConfigurationTarget.WorkspaceFolder),
      configuration.update('secretAccessKey', undefined, vscode.ConfigurationTarget.WorkspaceFolder),
    ]);
  }
}

async function migrateLegacyConfigurationCredentials(context: vscode.ExtensionContext): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('bedrockInline');
  const configuredAccessKeyId = configuration.get<string>('accessKeyId', '').trim();
  const configuredSecretAccessKey = configuration.get<string>('secretAccessKey', '').trim();

  if (!configuredAccessKeyId && !configuredSecretAccessKey) {
    return;
  }

  const existingCredentials = await getStoredCredentials(context);
  const accessKeyId = existingCredentials.accessKeyId || configuredAccessKeyId;
  const secretAccessKey = existingCredentials.secretAccessKey || configuredSecretAccessKey;

  if (accessKeyId) {
    await context.secrets.store(ACCESS_KEY_ID_SECRET_KEY, accessKeyId);
  }

  if (secretAccessKey) {
    await context.secrets.store(SECRET_ACCESS_KEY_SECRET_KEY, secretAccessKey);
  }

  await clearLegacyConfigurationCredentials();

  void vscode.window.showInformationMessage(
    'Bedrock Inline moved AWS credentials from settings.json into VS Code Secret Storage.'
  );
}

async function promptAndStoreCredentials(context: vscode.ExtensionContext): Promise<void> {
  const currentCredentials = await getStoredCredentials(context);

  const accessKeyId = await vscode.window.showInputBox({
    title: 'Bedrock Inline: AWS Access Key ID',
    prompt: 'Store the AWS access key ID in VS Code Secret Storage.',
    value: currentCredentials.accessKeyId,
    ignoreFocusOut: true,
  });

  if (accessKeyId === undefined) {
    return;
  }

  const secretAccessKey = await vscode.window.showInputBox({
    title: 'Bedrock Inline: AWS Secret Access Key',
    prompt: 'Store the AWS secret access key in VS Code Secret Storage.',
    value: currentCredentials.secretAccessKey,
    password: true,
    ignoreFocusOut: true,
  });

  if (secretAccessKey === undefined) {
    return;
  }

  await Promise.all([
    context.secrets.store(ACCESS_KEY_ID_SECRET_KEY, accessKeyId.trim()),
    context.secrets.store(SECRET_ACCESS_KEY_SECRET_KEY, secretAccessKey.trim()),
  ]);

  await clearLegacyConfigurationCredentials();

  void vscode.window.showInformationMessage('Bedrock Inline credentials were stored securely.');
}

async function clearStoredCredentials(context: vscode.ExtensionContext): Promise<void> {
  await Promise.all([
    context.secrets.delete(ACCESS_KEY_ID_SECRET_KEY),
    context.secrets.delete(SECRET_ACCESS_KEY_SECRET_KEY),
  ]);

  await clearLegacyConfigurationCredentials();

  void vscode.window.showInformationMessage('Bedrock Inline credentials were cleared.');
}


function updateStatusBarItem(newFeatureState: boolean, isLoading?: boolean): void {
  if (!statusBarItem) {
    return;
  }

  statusBarItem.backgroundColor = undefined;

  if (!newFeatureState) {
    statusBarItem.text = '$(circle-slash) Bedrock Inline: OFF';
    statusBarItem.tooltip = 'Click to turn Bedrock Inline on.';
    return;
  }

  if (isLoading) {
    statusBarItem.text = '$(loading) Bedrock Inline: ON';
  } else {
    statusBarItem.text = '$(pass) Bedrock Inline: ON';
  }

  statusBarItem.tooltip = 'Click to turn Bedrock Inline off.';
}


export function activate(context: vscode.ExtensionContext) {
  void migrateLegacyConfigurationCredentials(context);

  const handleToggleFeatureEnabled = async () => {
    const featureState = context.globalState.get<boolean>(FEATURE_STATE_KEY, false);
    const newFeatureState = !featureState;
    await context.globalState.update(FEATURE_STATE_KEY, newFeatureState);
    updateStatusBarItem(newFeatureState);
  };

  const handleTriggerSuggestion = async () => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const featureState = context.globalState.get<boolean>(FEATURE_STATE_KEY, false);
    if (!featureState) {
      await context.globalState.update(FEATURE_STATE_KEY, true);
      updateStatusBarItem(true);
    }

    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  };

  const toggleDisposable = vscode.commands.registerCommand('bedrockInline.toggleNextSuggestion', handleToggleFeatureEnabled);
  const triggerDisposable = vscode.commands.registerCommand('bedrockInline.triggerSuggestion', handleTriggerSuggestion);
  const setCredentialsDisposable = vscode.commands.registerCommand('bedrockInline.setCredentials', async () => {
    await promptAndStoreCredentials(context);
  });
  const clearCredentialsDisposable = vscode.commands.registerCommand('bedrockInline.clearCredentials', async () => {
    await clearStoredCredentials(context);
  });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.command = 'bedrockInline.toggleNextSuggestion';
  context.subscriptions.push(statusBarItem);

  const featureState = context.globalState.get<boolean>(FEATURE_STATE_KEY, false);
  updateStatusBarItem(featureState);
  statusBarItem.show();
  context.subscriptions.push(toggleDisposable);
  context.subscriptions.push(triggerDisposable);
  context.subscriptions.push(setCredentialsDisposable);
  context.subscriptions.push(clearCredentialsDisposable);

  const onStateChange = (loading: boolean) => {
    updateStatusBarItem(context.globalState.get<boolean>(FEATURE_STATE_KEY, false), loading);
  };

  const amazonBedrockInlineCompletionItemProvider = new AmazonBedrockInlineCompletionItemProvider(
    context,
    onStateChange,
    () => getStoredCredentials(context),
  );
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
