# Bedrock Inline

A VS Code plugin that brings Amazon Bedrock's powerful AI capabilities to your editor with Bring Your Own Key (BYOK) support for inline code suggestions and completions.

## Features

- **Inline Suggestions**: Get real-time AI-powered code suggestions as you type
- **Amazon Bedrock Integration**: Leverage Bedrock's foundation models for high-quality code generation
- **Seamless Integration**: Works directly in VS Code without external dependencies

## Installation

1. Install the extension from the VS Code Marketplace
2. Open the extension settings
3. Configure your Amazon Bedrock credentials (AWS Access Key ID, Secret Key, and Region)
4. Start coding and enjoy AI-powered inline suggestions

## Configuration

### Settings

Configure the following in your VS Code settings:

```json
{
  "bedrockInline.profile": "your-aws-profile-name",
  // or
  "bedrockInline.accessKeyId": "your-access-key-id",
  "bedrockInline.secretAccessKey": "your-secret-access-key",

  "bedrockInline.region": "us-west-2",
  "bedrockInline.modelId": "qwen.qwen3-coder-30b-a3b-v1:0"
}
```

## Usage

1. Start typing code in any supported file
2. Inline suggestions will appear automatically
3. Press `Tab` to accept a suggestion or `Escape` to dismiss it
4. Run `Bedrock Inline: Toggle Next Suggestion` from the Command Palette to enable or disable suggestions

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

MIT
