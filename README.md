# Bedrock Inline

A VS Code plugin that brings Amazon Bedrock's powerful AI capabilities to your editor with Bring Your Own Key (BYOK) support for inline code suggestions and completions.

## Features

- **Inline Suggestions**: Get real-time AI-powered code suggestions as you type
- **Amazon Bedrock Integration**: Leverage Bedrock's foundation models for high-quality code generation
- **Seamless Integration**: Works directly in VS Code without external dependencies

## Installation

1. Install the extension from the VS Code Marketplace
2. Open the extension settings
3. Configure your Amazon Bedrock region and optional AWS profile
4. Run `Bedrock Inline: Set AWS Credentials` if you want to use direct access keys
4. Start coding and enjoy AI-powered inline suggestions

## Configuration

### Settings

Configure the following in your VS Code settings:

```json
{
  "bedrockInline.profile": "your-aws-profile-name",
  "bedrockInline.region": "us-west-2",
  "bedrockInline.modelId": "qwen.qwen3-coder-30b-a3b-v1:0",
  "bedrockInline.temperature": 0.1,
  "bedrockInline.topP": 0.9,
  "bedrockInline.maxTokens": 256
}
```

AWS credentials are no longer meant to live in `settings.json`. Use the `Bedrock Inline: Set AWS Credentials` command to store them in VS Code Secret Storage instead.

## Usage

1. Start typing code in any supported file
2. Inline suggestions will appear automatically
3. Press `Tab` to accept a suggestion or `Escape` to dismiss it
4. Press `Cmd+Alt+.` on macOS (`Ctrl+Alt+.` on Windows/Linux) to explicitly trigger a suggestion
5. Run `Bedrock Inline: Toggle Next Suggestion` from the Command Palette to enable or disable suggestions

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

MIT
