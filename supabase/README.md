# Backend compartilhado Confiauto Serra

O GitHub Pages serve a interface estática; o Supabase guarda contas, fotos privadas e relatórios compartilhados.

## Configuração já aplicada

O projeto Supabase da Confiauto está conectado ao app. O esquema SQL está em [supabase-schema.sql](../supabase-schema.sql) e a função de convites foi publicada como Edge Function invite-user.

O endereço do site e a chave publicável ficam em supabase-config.js. Essa chave pode ser usada no navegador. Nunca publique uma chave service_role.

## Contas

A conta inicial de administrador é supervisaoconfiauto@gmail.com. O convite de acesso foi enviado por e-mail. Após aceitar, o gerente pode convidar supervisores pelo painel, informando nome, e-mail e equipe.

Supervisores selecionam vários bairros e registram, por bairro, data de ação, consultores presentes e observações. Administradores veem todos os relatos e as atualizações em tempo real; supervisores veem os próprios relatos. Fotos de perfil são privadas e limitadas a 5 MB.

As contas são por convite. O link de convite e redefinição de senha retorna ao endereço publicado no GitHub Pages.
