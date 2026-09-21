# TableBoy Studio

Editor desktop moderno de tabelas de caracteres `.tbl` para ROM hacking.

O MVP trabalha com tabelas 8-bit (`00`–`FF`) e mantém o core de parsing e
serialização independente da interface React.

## Recursos do MVP

- matriz hexadecimal editável 16×16;
- criação, abertura e salvamento de arquivos `.tbl` reais;
- Save As e Drag & Drop de um arquivo `.tbl`;
- suporte a Unicode, tokens e strings em cada célula;
- catálogo de caracteres latino, PT-BR, Romaji, Hiragana e Katakana;
- preenchimento sequencial de `A-Z`, `a-z` e `0-9`;
- validação de linhas inválidas e chaves duplicadas;
- histórico Undo/Redo;
- proteção contra perda de alterações em New, Open e ao fechar a janela;
- renderer isolado do filesystem por `contextBridge` e IPC tipado.

## Formato `.tbl`

Cada linha associa uma chave hexadecimal a um valor:

```text
41=A
42=B
43=C
F1=Ã
F2=Õ
F4=ã
F5=õ
```

Linhas vazias e comentários iniciados por `#`, `;` ou `//` são aceitos pelo
core. O editor visual deste MVP carrega somente entradas de um byte.

## Atalhos

| Ação    | Atalho         |
| ------- | -------------- |
| New     | `Ctrl+N`       |
| Open    | `Ctrl+O`       |
| Save    | `Ctrl+S`       |
| Save As | `Ctrl+Shift+S` |
| Undo    | `Ctrl+Z`       |
| Redo    | `Ctrl+Y`       |

## Desenvolvimento

Requisitos: Node.js e npm.

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Empacotamento

```bash
npm run build:unpack
npm run build:win
```

Os artefatos são gerados em `dist/`.

## Limites atuais

O MVP não inclui editor 16-bit, conversão OEM/ANSI, Shift-JIS, ROM viewer,
edição de fontes ou importação de ROM. Esses recursos podem ser adicionados
sem acoplar sua lógica aos componentes React.
