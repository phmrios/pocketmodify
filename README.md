# PocketModify

Transforma PDFs e imagens em um caderninho de bolso de 8 páginas impresso em uma única folha A4 (formato "PocketMod"). Tudo roda no navegador: nenhum arquivo é enviado a servidor.

## Funcionalidades

- Aceita vários PDFs e imagens (JPG, PNG, WebP...) de uma vez; cada 8 páginas viram uma folha.
- Editor com miniaturas: reordenar (arrastando ou pelas setas), remover e inserir páginas em branco.
- Páginas em branco lisas, pautadas, quadriculadas ou pontilhadas.
- Lombada à esquerda ou à direita (estilo mangá).
- Páginas em paisagem giram automaticamente; margem de 5 mm em cada página e linha tracejada de corte.
- Modelos prontos: agenda semanal, lista de compras e caderno pautado.
- Pré-visualização das folhas antes de baixar.
- Funciona offline e pode ser instalado no celular (PWA).

## Rodar localmente

O site é estático, sem build. Para o modo offline funcionar é preciso servir via HTTP:

```sh
python3 -m http.server 8000
# abra http://localhost:8000
```

Abrir o `index.html` direto também funciona, mas sem o service worker.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `js/pocketmod.js` | Monta as folhas A4 (layout, rotação, margens, padrões, linha de corte). Não usa o DOM. |
| `js/sources.js` | Converte arquivos (PDF/imagem) em páginas e gera miniaturas. |
| `js/templates.js` | Gera os modelos prontos. |
| `js/preview.js` | Renderiza a pré-visualização com pdf.js. |
| `js/app.js` | Interface: upload, editor, opções e download. |
| `sw.js` | Cache offline (rede primeiro, cache como reserva). |
| `vendor/` | Cópias locais de [pdf-lib](https://pdf-lib.js.org) 1.17.1 e [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174, com as licenças. |

## Layout da folha

Folha em paisagem, impressão só na frente:

```
 ┌─────┬─────┬─────┬─────┐
 │  2  │  3  │  4  │  5  │  ← de cabeça para baixo
 ├─────┼ ─ ─ ┼ ─ ─ ┼─────┤  ← corte só no trecho tracejado
 │  1  │  8  │  7  │  6  │
 └─────┴─────┴─────┴─────┘
   capa  contracapa
```

Com lombada à direita, as colunas são espelhadas.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie este projeto (`git remote add origin ...` e `git push -u origin main`).
2. No repositório: **Settings → Pages → Build and deployment → Deploy from a branch**, escolha `main` e a pasta `/ (root)`.
3. O site fica em `https://<usuario>.github.io/<repositorio>/`.
