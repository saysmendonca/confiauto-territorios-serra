# Confiauto • Territórios Serra

Mapa interativo dos bairros oficiais de Serra/ES para planejar a atuação comercial da Confiauto. A aplicação usa GitHub Pages como site estático e Supabase para autenticação e dados compartilhados de campo.

## Acesso ao painel

O backend Supabase já está conectado e publicado. A conta administradora `supervisaoconfiauto@gmail.com` recebeu um convite por e-mail. Depois de aceitar e entrar no painel, o gerente poderá convidar cada supervisor, escolher a equipe e enviar o acesso por e-mail.

As instruções técnicas e o esquema do banco estão em [supabase/README.md](supabase/README.md). O app exige login; os relatos são compartilhados conforme o papel de cada usuário.

## Recursos do painel

- Login por convite para administradores e supervisores.
- Convites de usuários por e-mail e equipe, com definição individual de senha.
- Foto de perfil privada, com envio de imagem até 5 MB.
- Seleção de vários bairros e formulário independente por bairro para data, consultores presentes e observação.
- Visão de relatórios de todas as equipes para administradores; supervisores consultam os próprios registros.
- Atualização do painel em tempo real e dados protegidos por Row Level Security.
- Distribuição das áreas em cinco equipes com cores diferentes.

Os limites dos bairros vêm da camada oficial **PLA_BairroLei45142016**, da Prefeitura Municipal da Serra. O mapa-base usa OpenStreetMap. Ambos requerem internet.

## Prévia local

Na pasta do projeto, inicie um servidor estático:

```sh
python3 -m http.server 8000
```

Depois abra [http://localhost:8000](http://localhost:8000). O login usa o mesmo banco compartilhado do app publicado.
