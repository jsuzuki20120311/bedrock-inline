# Bedrock Inline

A VS Code plugin that brings Amazon Bedrock's powerful AI capabilities to your editor with Bring Your Own Key (BYOK) support for inline code suggestions and completions.

## Features

- **Inline Suggestions**: Get real-time AI-powered code suggestions as you type
- **Amazon Bedrock Integration**: Leverage Bedrock's foundation models for high-quality code generation
- **BYOK Support**: Use your own AWS credentials and API keys for complete control
- **Seamless Integration**: Works directly in VS Code without external dependencies
- **Fast & Responsive**: Low-latency completions for an uninterrupted coding experience

## Installation

1. Install the extension from the VS Code Marketplace
2. Open the extension settings
3. Configure your Amazon Bedrock credentials (AWS Access Key ID, Secret Key, and Region)
4. Start coding and enjoy AI-powered inline suggestions

## Requirements

- VS Code 1.70.0 or higher
- Active AWS account with Bedrock access
- AWS credentials with appropriate Bedrock permissions

## Configuration

### Settings

Configure the following in your VS Code settings:

```json
{
  "bedrockInline.profile": "your-aws-profile-name",
  // or
  "bedrockInline.awsAccessKeyId": "your-access-key-id",
  "bedrockInline.awsSecretAccessKey": "your-secret-access-key",

  "bedrockInline.awsRegion": "us-west-2",
  "bedrockInline.modelId": "openai.gpt-oss-20b:1.0.0"
}
```

## Usage

1. Start typing code in any supported file
2. Inline suggestions will appear automatically
3. Press `Tab` to accept a suggestion or `Escape` to dismiss it
4. Use `Ctrl+Shift+A` (or `Cmd+Shift+A` on macOS) to manually trigger suggestions

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

MIT
