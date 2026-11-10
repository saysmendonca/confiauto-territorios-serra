# Confiauto • Territórios Serra

Mapa interativo dos bairros oficiais de Serra/ES para planejar a atuação comercial da Confiauto. A aplicação usa GitHub Pages como site estático e Supabase para autenticação e dados compartilhados de campo.

## Acesso ao painel

O backend Supabase já está conectado e publicado. A conta administradora `supervisaoconfiauto@gmail.com` recebeu um convite por e-mail. Depois de entrar no painel, o gerente poderá convidar supervisores e consultores, escolhendo a equipe de cada um.

As instruções técnicas e o esquema do banco estão em [supabase/README.md](supabase/README.md). O app exige login; os relatos são compartilhados conforme o papel de cada usuário.

## Recursos do painel

- Login por convite para administradores, supervisores e consultores.
- Convites de usuários por e-mail, com vínculo à equipe.
- Foto de perfil privada, com envio de imagem até 5 MB.
- Supervisores registram ações em vários bairros; consultores escolhem bairros e registram a data e sua programação.
- Marcadores no mapa indicam a data e o bairro das atividades registradas.
- Administradores veem todas as equipes; supervisores e consultores consultam os próprios registros.
- Atualização do painel em tempo real e dados protegidos por Row Level Security.
- Distribuição das áreas em cinco equipes com cores diferentes.

Os limites dos bairros vêm da camada oficial **PLA_BairroLei45142016**, da Prefeitura Municipal da Serra. O mapa-base usa OpenStreetMap. Ambos requerem internet.

## Prévia local

Na pasta do projeto, inicie um servidor estático:

```sh
python3 -m http.server 8000
```

Depois abra [http://localhost:8000](http://localhost:8000). O login usa o mesmo banco compartilhado do app publicado.
