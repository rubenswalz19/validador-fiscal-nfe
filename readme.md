# Validador Fiscal NF-e

Painel web para auditar notas fiscais eletrônicas (NF-e), conferir a situação cadastral do CNPJ do emitente e comparar o valor total da nota com a soma dos produtos.

## Executar localmente

Abra `index.html` no navegador ou sirva a pasta com um servidor estático local.

## Recursos

- Importação de arquivos XML de NF-e.
- Consulta de CNPJ pela BrasilAPI.
- Indicadores e histórico de notas auditadas.
- Persistência local no navegador.
- Integração opcional com Supabase.

## Configuração opcional do Supabase

Em `app.js`, substitua `SUPABASE_URL` e `SUPABASE_KEY` pela URL do projeto e pela chave pública anon do Supabase. Configure as permissões e políticas da tabela `notas_fiscais` antes de habilitar a integração.

O painel também funciona sem Supabase, salvando os registros localmente no navegador utilizado.

## Publicar na Vercel

Importe este repositório na Vercel como projeto estático. Use a pasta raiz como diretório do projeto; não é necessário comando de build.