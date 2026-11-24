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

## Supabase

O painel está conectado ao projeto Supabase `validador-fiscal-nfe`. O acesso às notas exige uma conta; cada usuário autenticado só pode consultar e inserir os próprios registros, usando políticas de Row Level Security (RLS).

A interface usa a chave pública `sb_publishable_`, apropriada para uso no navegador. Nunca coloque uma chave `sb_secret_` ou `service_role` no frontend ou no repositório.

Novos usuários podem precisar confirmar o endereço de e-mail antes de entrar, conforme a configuração de autenticação do projeto.

## Publicar na Vercel

Importe este repositório na Vercel como projeto estático. Use a pasta raiz como diretório do projeto; não é necessário comando de build.