# Guia de Publicação - NZR Dev Plugin

Este guia detalha todos os passos necessários para publicar a extensão no VSCode Marketplace.

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Criar Conta de Publisher](#2-criar-conta-de-publisher)
3. [Gerar Personal Access Token](#3-gerar-personal-access-token)
4. [Preparar a Extensão](#4-preparar-a-extensão)
5. [Build e Empacotamento](#5-build-e-empacotamento)
6. [Testar Localmente](#6-testar-localmente)
7. [Publicar no Marketplace](#7-publicar-no-marketplace)
8. [Atualizar Versão](#8-atualizar-versão)

---

## 1. Pré-requisitos

### Ferramentas necessárias

```bash
# Instalar VSCE (Visual Studio Code Extension Manager)
npm install -g @vscode/vsce

# Verificar instalação
vsce --version
```

### Contas necessárias

- [ ] Conta Microsoft (outlook.com, hotmail.com, ou conta corporativa)
- [ ] Conta Azure DevOps (criada automaticamente com conta Microsoft)

---

## 2. Criar Conta de Publisher

### Passo 2.1: Acessar o Marketplace

1. Acesse: https://marketplace.visualstudio.com/manage
2. Faça login com sua conta Microsoft

### Passo 2.2: Criar Publisher

1. Clique em **"Create Publisher"**
2. Preencha os campos:
   - **Name**: `NZR Group` (nome de exibição)
   - **ID**: `nzrgroup` (deve corresponder ao campo `publisher` no package.json)
   - **Description**: Descrição da organização (opcional)
   - **Website**: URL do site (opcional)
3. Clique em **"Create"**

> **IMPORTANTE**: O ID do publisher (`nzrgroup`) deve ser exatamente igual ao campo `"publisher"` no `package.json`.

---

## 3. Gerar Personal Access Token (PAT)

O PAT é necessário para autenticar a publicação via CLI.

### Passo 3.1: Acessar Azure DevOps

1. Acesse: https://dev.azure.com
2. Faça login com a mesma conta Microsoft

### Passo 3.2: Criar o Token

1. Clique no ícone de usuário (canto superior direito)
2. Selecione **"Personal access tokens"**
3. Clique em **"New Token"**

### Passo 3.3: Configurar o Token

Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Name** | `vsce-publish` (ou outro nome descritivo) |
| **Organization** | `All accessible organizations` |
| **Expiration** | Escolha (máximo 1 ano) |
| **Scopes** | `Custom defined` |

### Passo 3.4: Definir Permissões

1. Clique em **"Show all scopes"** (parte inferior)
2. Encontre **"Marketplace"**
3. Marque **"Manage"** (isso inclui Publish)

### Passo 3.5: Salvar o Token

1. Clique em **"Create"**
2. **COPIE O TOKEN IMEDIATAMENTE** - ele não será mostrado novamente!
3. Guarde em local seguro (gerenciador de senhas)

---

## 4. Preparar a Extensão

### 4.1. Verificar package.json

Certifique-se que os campos obrigatórios estão preenchidos:

```json
{
  "name": "nzr-dev-vscode",
  "displayName": "NZR Dev Plugin",
  "description": "Remote VSCode control from mobile devices",
  "version": "0.1.0",
  "publisher": "nzrgroup",
  "repository": {
    "type": "git",
    "url": "https://github.com/nzrgroup/nzr-dev-plugin"
  },
  "icon": "images/icon.png",
  "galleryBanner": {
    "color": "#1e1e1e",
    "theme": "dark"
  },
  "categories": ["Other"],
  "keywords": ["remote", "mobile", "control", "websocket"]
}
```

### 4.2. Criar Ícone

O ícone é **obrigatório** para publicação.

**Especificações:**
- Formato: PNG
- Tamanho: 128x128 pixels (mínimo)
- Recomendado: 256x256 pixels
- Fundo: transparente ou sólido

**Criar a pasta e adicionar o ícone:**

```bash
mkdir -p vscode-extension/images
# Adicione seu icon.png nesta pasta
```

### 4.3. Verificar README.md

O README será exibido na página da extensão no Marketplace. Verifique se contém:

- [ ] Descrição clara da extensão
- [ ] Lista de funcionalidades
- [ ] Instruções de instalação
- [ ] Como usar (Getting Started)
- [ ] Configurações disponíveis
- [ ] Screenshots (opcional, mas recomendado)

### 4.4. Criar CHANGELOG.md

```bash
# Criar arquivo de changelog
cat > vscode-extension/CHANGELOG.md << 'EOF'
# Changelog

All notable changes to "NZR Dev Plugin" will be documented in this file.

## [0.1.0] - 2026-01-12

### Added
- Initial release
- QR Code pairing with mobile devices
- Local WiFi connection support
- Internet tunnel for remote access (4G/LTE)
- mDNS/Bonjour discovery
- File browsing and editing
- Terminal access
- AI chat integration
- Git/Source control
- Diagnostics viewer

### Security
- Secure WebSocket connections
- Token-based authentication
- Automatic session expiration
EOF
```

### 4.5. Criar .vscodeignore

Este arquivo define o que NÃO será incluído no pacote:

```bash
cat > vscode-extension/.vscodeignore << 'EOF'
.vscode/**
.vscode-test/**
src/**
node_modules/**
!node_modules/@nzr-dev/shared/dist/**
.gitignore
.yarnrc
vsc-extension-quickstart.md
**/tsconfig.json
**/.eslintrc.js
**/*.map
**/*.ts
!**/*.d.ts
**/*.test.js
PUBLISHING.md
EOF
```

---

## 5. Build e Empacotamento

### 5.1. Build do Shared Package

```bash
cd shared
npm run build
cd ..
```

### 5.2. Build da Extensão

```bash
cd vscode-extension
npm run build
```

### 5.3. Verificar Erros

```bash
# Verificar se há problemas
npx vsce ls

# Isso lista todos os arquivos que serão incluídos no pacote
```

### 5.4. Criar Pacote .vsix

```bash
# Gerar o arquivo .vsix
npx vsce package

# Isso criará: nzr-dev-vscode-0.1.0.vsix
```

Se houver erros, corrija antes de prosseguir.

---

## 6. Testar Localmente

### 6.1. Instalar a Extensão Localmente

1. Abra o VSCode
2. Pressione `Ctrl+Shift+P` (ou `Cmd+Shift+P` no Mac)
3. Digite: `Extensions: Install from VSIX...`
4. Selecione o arquivo `.vsix` gerado
5. Reinicie o VSCode se solicitado

### 6.2. Verificar Funcionalidades

- [ ] Extensão aparece na lista de extensões instaladas
- [ ] Comandos aparecem na Command Palette (`NZR Dev:...`)
- [ ] Status bar mostra "NZR: Ready" e "Tunnel: Off"
- [ ] QR Code é gerado corretamente
- [ ] Configurações aparecem nas Settings

### 6.3. Desinstalar Após Teste

1. Extensions → NZR Dev Plugin → Uninstall
2. Ou via CLI: `code --uninstall-extension nzrgroup.nzr-dev-vscode`

---

## 7. Publicar no Marketplace

### 7.1. Login no VSCE

```bash
npx vsce login nzrgroup
# Cole o Personal Access Token quando solicitado
```

### 7.2. Publicar

```bash
# Publicar diretamente
npx vsce publish

# OU publicar com incremento de versão
npx vsce publish patch  # 0.1.0 → 0.1.1
npx vsce publish minor  # 0.1.0 → 0.2.0
npx vsce publish major  # 0.1.0 → 1.0.0
```

### 7.3. Verificar Publicação

1. Acesse: https://marketplace.visualstudio.com/manage
2. Sua extensão deve aparecer na lista
3. Pode levar alguns minutos para ficar disponível publicamente

---

## 8. Atualizar Versão

Para publicar uma atualização:

### 8.1. Atualizar Código

1. Faça as alterações necessárias
2. Atualize o CHANGELOG.md

### 8.2. Atualizar Versão

```bash
# Incrementar versão automaticamente e publicar
npx vsce publish patch  # Para correções
npx vsce publish minor  # Para novas funcionalidades
npx vsce publish major  # Para mudanças incompatíveis
```

Ou manualmente:

```bash
# Editar version no package.json
npm version patch  # ou minor, major

# Rebuild e publicar
npm run build
npx vsce publish
```

---

## Checklist Final

Antes de publicar, verifique:

- [ ] `publisher` no package.json corresponde ao ID do publisher criado
- [ ] `icon` definido e arquivo existe em `images/icon.png`
- [ ] `repository` URL está correta
- [ ] `README.md` está completo e bem formatado
- [ ] `CHANGELOG.md` existe e está atualizado
- [ ] `.vscodeignore` configurado corretamente
- [ ] Build passa sem erros (`npm run build`)
- [ ] `vsce package` gera o .vsix sem erros
- [ ] Extensão testada localmente e funcionando
- [ ] Personal Access Token válido e com permissões corretas

---

## Problemas Comuns

### "Missing publisher name"

```bash
# Verifique se o publisher está no package.json
"publisher": "nzrgroup"
```

### "Missing icon"

```bash
# Adicione o ícone e referência no package.json
"icon": "images/icon.png"
```

### "Invalid token"

- Verifique se o token não expirou
- Verifique se tem a permissão "Marketplace > Manage"
- Gere um novo token se necessário

### "403 Forbidden"

- O ID do publisher no package.json deve corresponder exatamente ao publisher da sua conta
- Verifique se você está logado com a conta correta

---

## Links Úteis

- [VSCode Extension API](https://code.visualstudio.com/api)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Management](https://marketplace.visualstudio.com/manage)
- [Azure DevOps](https://dev.azure.com)
- [VSCE Tool](https://github.com/microsoft/vscode-vsce)
