# Backend compartilhado Confiauto Serra

O app do GitHub Pages já está conectado ao Supabase. O esquema SQL está em [supabase-schema.sql](../supabase-schema.sql); a função de convites foi publicada como Edge Function `invite-user`.

O endereço do site e a chave publicável ficam em `supabase-config.js`. Essa chave pode ser usada no navegador. Nunca publique uma chave `service_role`.

## E-mails de acesso

O SMTP padrão do Supabase só envia mensagens para membros da equipe da organização. Para convidar supervisores externos, configure um SMTP próprio em **Authentication → Emails** no projeto. Os convites feitos pelo painel dependem dessa entrega por e-mail.

A conta administradora inicial é `supervisaoconfiauto@gmail.com`. Depois de entrar no app, o gerente convida supervisores e escolhe a equipe de cada um.

## Dados do app

Supervisores podem selecionar vários bairros e registrar, para cada bairro, a data da ação, os consultores presentes e uma observação. Administradores veem os relatos de todas as equipes e recebem atualizações em tempo real; supervisores consultam apenas os próprios relatos. As fotos de perfil ficam privadas no Supabase Storage e aceitam imagens de até 5 MB.
