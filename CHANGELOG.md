# Changelog

## 1.5.0 — entrega local do editor de tabelas

- Aplicativo concentrado em criar, abrir, editar, validar e salvar tabelas `.tbl`.
- Mantidos os modos 8/16 bits, catálogo, inspector, busca de entradas, Undo/Redo,
  drag and drop e proteção de alterações não salvas.
- Inicialização com documento vazio em vez de uma tabela de demonstração.
- Removidos do projeto ativo ROM Tools, Text Search, Text Browser, assistente de
  mappings, motores de busca, workers, IPC binário e respectivos testes/benchmarks.
- Todo o projeto anterior foi arquivado em
  `archives/rom-tools-text-search-1.4.14.zip`, com manifesto de hashes SHA-256.
  O changelog anterior e as etapas internas estão preservados nesse ZIP.
- Removida a dependência direta de codecs que servia à busca em ROMs.
- Preload isolado com sandbox habilitado e janela com dimensões mínimas do editor.
- Empacotamento por lista explícita de bundles, sem fontes, backups ou testes.
- Artefatos desta versão em `dist/table-editor-1.5.0/`, separados dos anteriores.

Esta entrada descreve a entrega local; não representa publicação no GitHub,
assinatura digital ou validação das versões de macOS/Linux.
