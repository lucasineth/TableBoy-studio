# TableBoy Studio 1.5.0 — validação da entrega Windows

Validado em 24/10/2026 no Windows x64, Node.js 24.18.0, npm 12.1.0 e Electron
44.4.3. Escopo: criar, editar, abrir, validar e salvar tabelas `.tbl`.

## Separação e preservação

- Snapshot anterior: `archives/rom-tools-text-search-1.4.14.zip` (185 arquivos).
- Cada entrada do ZIP foi relida e conferida pelo SHA-256 registrado no manifesto.
- Arquivos removidos foram comparados ao snapshot antes da remoção.
- Código ativo do core contém somente `characters` e `table`; o aplicativo não
  registra IPC binário/de busca, não cria workers e não expõe essas APIs no preload.
- O arquivo `app.asar` foi inspecionado: somente bundles `out`, `package.json` e
  dependências de runtime. Sem `archives`, `src`, `test`, `benchmark`, documentação
  ou módulos/workers antigos de busca.

## Comandos executados

| Verificação                   | Resultado                                         |
| ----------------------------- | ------------------------------------------------- |
| `npm run typecheck`           | Aprovado                                          |
| `npm run lint`                | Aprovado, inclusive o script de validação desktop |
| `npm test`                    | 37 testes aprovados, zero falhas                  |
| `npm run build`               | Aprovado                                          |
| `npm run build:win`           | Aprovado; instalador NSIS x64 gerado              |
| `git diff --check`            | Sem erros                                         |
| Aplicativo Windows empacotado | 9 cenários aprovados, zero exceções no renderer   |

## Fluxo desktop verificado

O script [verify-desktop.mjs](../scripts/verify-desktop.mjs) executou o
`win-unpacked/TableBoyStudio.exe` desta entrega. As escolhas dos diálogos nativos
foram automatizadas; interface, sandbox, preload, IPC e leitura/gravação no sistema
de arquivos foram reais. Fixtures e perfil de teste foram criados em pasta
temporária separada dos documentos do usuário.

1. Inicialização vazia, 256 células, preload funcionando no sandbox, Node ausente
   do renderer e ausência dos menus/APIs do ROM Tools.
2. Edição 8-bit de `A`, `ã` e `[END]`, salvamento por IPC e conferência dos bytes UTF-8.
3. Undo/Redo; Cancel preserva a tabela modificada; Save grava antes de criar outra.
4. Abrir restaura o arquivo salvo; arquivo malformado mantém a tabela atual intacta.
5. Tabela 16-bit, página `81`, salvar/reabrir `8140=あ` e `8141=い`, preservando as
   chaves completas e renderizando somente 256 células.
6. Catálogo altera somente a célula `8142`, preservando suas vizinhas.
7. Ctrl+F seleciona o endereço `8140`; F1 abre a ajuda de atalhos.
8. Cancel ao fechar mantém a janela e o documento modificado.
9. Nenhuma exceção no renderer durante a execução.

Evidências: [resultado estruturado](validation/desktop-check.json) e
[captura do editor](validation/table-editor-1.5.0.png).

Para repetir, use um módulo Playwright Core disponível no ambiente de validação:

```powershell
node scripts/verify-desktop.mjs --playwright-module "CAMINHO/playwright-core/index.mjs" --executable "dist/table-editor-1.5.0/win-unpacked/TableBoyStudio.exe"
```

Playwright foi utilizado a partir das ferramentas já disponíveis no ambiente;
nenhuma dependência adicional foi incluída no aplicativo ou no lockfile.

## Artefatos

- Instalador: `dist/table-editor-1.5.0/TableBoy Studio-Setup-1.5.0.exe`.
- Executável: `dist/table-editor-1.5.0/win-unpacked/TableBoyStudio.exe`.
- SHA-256 do instalador:
  `AD2E546F990333714FD5F5C13F280D273D54B4B2CF1A3DA1A59E018359E57434`.
- SHA-256 do arquivo de backup:
  `E99DD274E739A5DB5D06E2D0E8F1BA35AEA7F3C8C48D725C309FEAA0C831708F`.

## Limites desta validação

O executável está **sem assinatura digital** (`Get-AuthenticodeSignature`:
`NotSigned`). O instalador foi gerado; instalação/desinstalação pelo NSIS e a
interação manual com os diálogos nativos não foram executadas. macOS/Linux não
foram empacotados ou testados. Este relatório registra a validação local anterior
ao envio do código e à publicação de uma release.
