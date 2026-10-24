# ROM Tools — código preservado

`rom-tools-text-search-1.4.14.zip` contém 185 arquivos do workspace imediatamente
antes da separação do editor de tabelas, incluindo alterações ainda não commitadas.
É um snapshot do código integrado, não um repositório Git ou aplicativo independente.

Preserva Text Search (Table, Relative, Known-Text e String Scanner), Text Browser,
análise de candidatos, assistente Create Table, IPC/worker, codecs, testes,
benchmarks, documentação, assets, arquivos de build e lockfile. A opção de bases
independentes para maiúsculas/minúsculas e o `MEMORY.md` estão incluídos.

SHA-256 do ZIP:

```text
E99DD274E739A5DB5D06E2D0E8F1BA35AEA7F3C8C48D725C309FEAA0C831708F
```

O arquivo `.zip.sha256` fornece o mesmo hash. O `ARCHIVE_MANIFEST.json` dentro do
ZIP registra caminho, tamanho e SHA-256 de cada arquivo original. Todos os 185
arquivos foram relidos do ZIP e comparados ao manifesto antes da remoção das
implementações do projeto ativo.

## Restaurar em outro projeto

1. Confirme o hash com `Get-FileHash -Algorithm SHA256` no PowerShell.
2. Extraia para uma pasta nova e vazia, fora deste projeto. Não extraia por cima
   do editor 1.5.0.
3. Execute `npm ci`, `npm run typecheck`, `npm test` e `npm run build` na pasta
   restaurada. Dependências não acompanham o ZIP.
4. Use `npm run dev` para executar a versão integrada preservada.
5. Para desenvolver um ROM Tools independente, altere identidade/appId e separe
   o editor daquela cópia conforme necessário. O snapshot preserva as dependências
   entre módulos para que nenhuma funcionalidade precise ser reconstruída do zero.

O empacotamento do TableBoy 1.5.0 exclui esta pasta inteira.
