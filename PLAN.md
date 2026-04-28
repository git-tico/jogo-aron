# Plano: Jogo do Foguete para iOS (PWA)

## Contexto

Criar um jogo simples e acessível para um filho de 5 anos com necessidades motoras, cognitivas e visuais. O jogo deve rodar no iPhone sem passar pela App Store, funcionar offline e ter proteção contra saída acidental.

**Necessidades de acessibilidade:**
- Motor/coordenação: toque em qualquer ponto da tela (sem precisão fina)
- Cognitivo: interface mínima, poucos elementos, mecânica previsível
- Visual: alto contraste, elementos grandes, animações suaves

---

## Como instalar no iPhone (sem App Store, gratuito)

1. Abrir `index.html` num servidor local (ou via GitHub Pages/Netlify)
2. No Safari do iPhone → botão Compartilhar → **"Adicionar à Tela de Início"**
3. O jogo aparece como ícone nativo, abre em tela cheia sem barra do browser
4. Para travar no jogo (impedir saída acidental): **iOS Guided Access**
   - Ajustes → Acessibilidade → Guided Access → Ativar + criar senha
   - Com o jogo aberto, triplo clique no botão lateral → Start
   - Criança não consegue sair sem a senha

---

## Tech Stack

- **HTML5 Canvas + Vanilla JS** (mesma abordagem do moeboid — sem dependências)
- **PWA** com manifest.json + Service Worker (offline)
- **Web Audio API** para sons suaves e procedurais

---

## Estrutura de arquivos

```
/home/user/rocket-game/
├── index.html       ← HTML + meta tags PWA para iOS
├── game.js          ← lógica do jogo (Canvas)
├── manifest.json    ← PWA: nome, ícone, display standalone
├── sw.js            ← Service Worker para offline
└── icon.svg         ← ícone do app (foguete simples)
```

---

## Mecânica do jogo

**Modo retrato (portrait), tela cheia**

| Ação do usuário | Resultado |
|---|---|
| Toque em qualquer ponto | Foguete sobe (impulso) |
| Arrastar esquerda/direita | Foguete se move lateralmente |
| Nenhuma ação | Foguete desce suavemente (gravidade leve) |

**Progressão:**
- Fundo (espaço) rola para baixo conforme foguete sobe
- Após ~2 minutos de "altitude", aparece a linha de chegada
- Celebração: confetti, estrelas brilhantes, som alegre, texto "Parabéns! 🚀"
- Após 8 segundos, reinicia automaticamente

**Sem tela de "Game Over", sem pontuação, sem frustração.**

---

## Elementos visuais durante o jogo

Aparecem aleatoriamente para entreter:
- Estrelas cadentes cruzando a tela (suaves)
- Planetas coloridos ao fundo
- Partículas brilhantes saindo do foguete ao acelerar
- Nuvens no início (atmosfera), estrelas depois (espaço)

---

## Sons (Web Audio API, procedurais)

- **Tap/boost**: som de whoosh suave
- **Milestone** (a cada 25% do percurso): som positivo curto
- **Celebração**: melodia alegre simples
- Sem sons de falha/erro

---

## Design visual

- Fundo: gradiente dark (azul escuro → preto do espaço)
- Foguete: grande, brilhante, alto contraste
- Nenhum texto de UI durante o jogo (sem distrações cognitivas)
- Partículas de fogo/propulsão no foguete
- Tela de celebração: cores vibrantes, confetti

---

## Arquivos críticos a criar

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Meta tags iOS, viewport, link manifest, canvas element |
| `game.js` | Loop do jogo, física, input touch, renderer, audio |
| `manifest.json` | `display: "standalone"`, orientação portrait, ícone |
| `sw.js` | Cache-first strategy para todos os arquivos |

---

## Verificação

1. Abrir `index.html` via servidor local: `python3 -m http.server 8080`
2. Acessar no iPhone via IP da rede local: `http://192.168.x.x:8080`
3. Testar no Safari: toque, arrasto, sons, progressão, celebração
4. Adicionar à Tela de Início e verificar modo standalone (sem barra do browser)
5. Colocar em modo avião e confirmar que funciona offline (Service Worker)
6. Ativar Guided Access e confirmar que criança não consegue sair
