# Confiauto • Territórios Serra

Painel local para distribuir os bairros de Serra/ES entre equipes de vendas.

## Abrir

Na pasta deste projeto, inicie um servidor estático:

```sh
python3 -m http.server 8000
```

Depois acesse [http://localhost:8000](http://localhost:8000). O mapa carrega a camada pública de bairros da Prefeitura da Serra e os mapas-base do OpenStreetMap, então precisa de conexão com a internet. Equipes e atribuições ficam salvas no armazenamento local do navegador.

## Recursos

- Clique em um bairro no mapa ou na lista para atribuir uma equipe.
- Cadastre equipes, representantes e cores personalizadas.
- Busque bairros, filtre por atribuição e exporte a divisão em CSV.
- Imprima o mapa ou use a tela cheia.

Os limites exibidos vêm da camada oficial **PLA_BairroLei45142016**, da Prefeitura Municipal da Serra. Fonte e informações no próprio mapa: [mapas.serra.es.gov.br](https://mapas.serra.es.gov.br/).
