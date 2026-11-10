# Backend compartilhado Confiauto Serra

O app do GitHub Pages já está conectado ao Supabase. O esquema SQL está em [supabase-schema.sql](../supabase-schema.sql); a função de convites foi publicada como Edge Function `invite-user`.

O endereço do site e a chave publicável ficam em `supabase-config.js`. Essa chave pode ser usada no navegador. Nunca publique uma chave `service_role`.

## E-mails de acesso

O SMTP padrão do Supabase só envia mensagens para membros da equipe da organização. Para convidar supervisores externos, configure um SMTP próprio em **Authentication → Emails** no projeto. Os convites feitos pelo painel dependem dessa entrega por e-mail.

A conta administradora inicial é `supervisaoconfiauto@gmail.com`. Depois de entrar no app, o gerente convida supervisores e consultores e escolhe a equipe de cada um.

## Dados do app

Supervisores podem selecionar vários bairros e registrar, para cada bairro, a data da ação, os consultores presentes e uma observação. Administradores veem os relatos de todas as equipes. Supervisores e consultores acessam apenas seus próprios registros. Consultores escolhem bairro/data e escrevem a programação no campo de observação. Cada registro aparece no mapa com marcador de data e local. Os dados recebem atualizações em tempo real e as fotos de perfil ficam privadas no Supabase Storage.

## Atualização para liberar perfis de consultor

No projeto existente, execute `migrations/20261106_consultant_access.sql` no SQL Editor. Rode primeiro apenas a instrução `ALTER TYPE` e confirme; depois rode o restante do arquivo. O Edge Function `invite-user` também deve ser atualizado para aceitar o perfil `consultant`.
