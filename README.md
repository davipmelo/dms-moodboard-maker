# DM'S MOODBOARD MAKER 🎨

Aplicativo profissional para criação, organização e exportação de moodboards dinâmicos e orgânicos, com suporte completo a **GIFs animados**, imagens **JPG, PNG e WebP**, navegação fluida com **PAN e Zoom infinito**, e exportação em alta definição para **JPG**, **PDF** e vídeo **MP4 / WebM**.

---

## 🌐 Publicação no GitHub Pages (.github.io)

O **DM'S MOODBOARD MAKER** foi projetado para funcionar de forma **100% estática e nativa no navegador**, permitindo que você o acesse de qualquer dispositivo (Mac, Windows, iPad, iPhone, etc.) sem precisar de nenhum servidor ativo.

### Passo a Passo para Publicar:

1. **Crie um repositório no seu GitHub**:
   * Vá em [github.com/new](https://github.com/new)
   * Nome sugerido: `dms-moodboard-maker`
   * Deixe como **Public** (ou Private, se tiver conta GitHub Pro) e clique em **Create repository**.

2. **Envie os arquivos para o GitHub** (execute no terminal dentro desta pasta):
   ```bash
   git init
   git add .
   git commit -m "feat: DM'S MOODBOARD MAKER initial release"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/dms-moodboard-maker.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages**:
   * No seu repositório no GitHub, clique na aba **Settings** (Configurações).
   * No menu lateral esquerdo, clique em **Pages**.
   * Em **Build and deployment > Branch**:
     * Selecione o branch `main` e a pasta `/ (root)`.
     * Clique em **Save**.
   * Pronto! Em cerca de 1 a 2 minutos, seu app estará no ar no endereço:
     👉 **`https://SEU_USUARIO.github.io/dms-moodboard-maker/`**

---

## 🚀 Como Rodar Localmente (Windows / Mac / Linux)

### No Windows:
Dê um duplo clique no arquivo [`iniciar.bat`](file:///c:/Users/Davi/Desktop/teste/teste/iniciar.bat). Ele iniciará o servidor local e abrirá o aplicativo automaticamente no seu navegador.

### No Mac ou Linux:
Abra o Terminal nesta pasta e execute:
```bash
python3 server.py
# ou simplesmente abra index.html em qualquer navegador
```
Acesse no navegador: **[http://127.0.0.1:8765/](http://127.0.0.1:8765/)**

---

## ✨ Funcionalidades Principais

### 1. Grid Orgânico Dinâmico (Masonry Collage)
* **Zero Espaços Mortos**: Imagens verticais e horizontais encaixam-se sem folgas, mantendo a proporção natural de cada imagem (*Pinterest / Editorial style*).
* **Grade Fixa Opcional**: Possibilidade de alternar para grade uniforme com proporções travadas (`1:1`, `4:3`, `3:4`, `16:9`, `9:16` ou `Livre`).
* **Reorganização Intuitiva (Drag & Drop)**: Arraste qualquer imagem para reposicioná-la com linha indicadora de inserção amarela.

### 2. Navegação Completa com PAN & Zoom Infinito
* **PAN (Navegar pela tela)**: Segure a **Barra de Espaço** (`Space`) e clique e arraste com o mouse. Também funciona clicando com a roda do mouse (*middle click*).
* **Zoom Centrado no Cursor**: Role a roda do mouse (**Scroll direto** ou **Alt + Scroll**) para aproximar ou afastar (15% a 400%).
* **Barra Flutuante de Viewport**: Botões `+`, `-`, nível em porcentagem, botão **Ajustar** e botão **100%**.

### 3. Inserção Ágil de Mídias
* **Colar com `Ctrl + V` / `Cmd + V`**: Cole screenshots da área de transferência, imagens copiadas ou links diretos.
* **Upload do Computador**: Botão de upload e suporte a arrastar arquivos locais direto para a tela.
* **Colar Múltiplos Links**: Modal dedicado para colar dezenas de URLs de uma vez.
* **CORS Resiliente**: Fallback automático entre servidor local, conexão direta e proxies públicos para links externos.

### 4. Estilo & Apresentação
* **Identidade Industrial Dark & Gema Yellow**: Fundo escuro profissional com realces em amarelo gema (`#ffbb00`).
* **Alinhamento Perfeito**: Título e subtítulo alinhados com a mesma linha vertical das imagens.
* **Seletor de Cor dos Textos**: Controle dedicado na sidebar para mudar a cor do título e subtítulo (amostras rápidas + seletor nativo).
* **Régua de Paleta Cromática**: Extrai automaticamente as cores dominantes das imagens com clique para copiar o código HEX.

### 5. Exportação Multi-Escala
* **Magnificação**: Escolha entre `1x`, `2x` (Retina HD), `3x` (Print 300 DPI) e `4x` (Ultra 4K+).
* **Formatos de Saída**:
  * **JPG**: Imagem ultra-nítida em alta definição.
  * **PDF**: Documento vetorial/rasterizado para impressão ou apresentação.
  * **MP4 / WebM**: Renderização de GIFs animados quadro a quadro com sincronização precisa (via FFmpeg local ou MediaRecorder nativo do navegador).
