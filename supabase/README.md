# Backend compartilhado Confiauto Serra

O app do GitHub Pages já está conectado ao Supabase. O esquema SQL está em [supabase-schema.sql](../supabase-schema.sql); a função de convites `invite-user` atende contas administrativas e de supervisão.

O endereço do site e a chave publicável ficam em `supabase-config.js`. Essa chave pode ser usada no navegador. Nunca publique uma chave `service_role`.

## E-mails de acesso

O SMTP padrão do Supabase só envia mensagens para membros da equipe da organização. Para convidar supervisores externos, configure um SMTP próprio em **Authentication → Emails** no projeto. Os convites feitos pelo painel dependem dessa entrega por e-mail.

A conta administradora inicial é `supervisaoconfiauto@gmail.com`. Consultores fazem o próprio cadastro e escolhem uma equipe; o banco sempre atribui a eles o papel `consultant`. O gerente continua responsável por convidar supervisores.

## Dados do app

Supervisores podem selecionar vários bairros e registrar, para cada bairro, a data da ação, os consultores presentes e uma observação. Administradores veem os relatos de todas as equipes. Supervisores e consultores acessam apenas seus próprios registros. Consultores escolhem bairro/data e escrevem a programação no campo de observação. Cada registro aparece no mapa com marcador de data e local. Os dados recebem atualizações em tempo real e as fotos de perfil ficam privadas no Supabase Storage.

## Atualização para liberar perfis de consultor

No projeto existente, execute `migrations/20261106_consultant_access.sql` no SQL Editor. A migration cria o perfil de consultor apenas para cadastros vindos do app e permite que cada consultor insira os próprios relatos. Depois, habilite **Allow new users to sign up** em Authentication → Sign In / Providers. Mantenha a confirmação de e-mail ativada. Para enviar confirmações a endereços externos, configure SMTP próprio em Authentication → Emails; o SMTP padrão do Supabase pode limitar os destinatários.
