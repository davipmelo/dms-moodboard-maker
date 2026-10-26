# 📋 Backlog de Melhorias & Novas Funcionalidades
### DM'S MOODBOARD MAKER

Lista de tarefas, melhorias e novas funcionalidades planejadas para o projeto ao longo do tempo.

---

## 🎯 Próximos Passos (To-Do)

### [ ] 1. Exportação Individual de Mídias em Resolução Original
- **Descrição**: Adicionar um botão de ação (ícone de download) diretamente na sobreposição (*overlay*) de cada imagem/GIF ou em um menu contextual da célula.
- **Comportamento**: Ao clicar, o navegador deve baixar o arquivo original correspondente (JPG, PNG, WebP ou GIF) na sua resolução nativa máxima, preservando a qualidade e a animação original.
- **Casos de uso**: Recuperar rapidamente assets originais curados no moodboard sem precisar do arquivo global exportado.

### [ ] 2. Suporte Completo a Vídeos no Moodboard (com Áudio e Loop)
- **Descrição**: Suportar a inclusão de arquivos e URLs de vídeo (especialmente `.mp4` e `.webm`).
- **Controles na Célula**:
  - Botão/ícone para alternar **Mute / Unmute** (áudio ativado/desativado por vídeo).
  - Controle de **Loop** (ativado por padrão para ambientação).
  - Opção de reproduzir/pausar ao passar o mouse ou por clique.
- **Impacto na Exportação**: Ajustar o pipeline de exportação de vídeo para mesclar as trilhas sonoras ou permitir escolher se o áudio deve entrar no vídeo final.

### [ ] 3. Estado Inicial Limpo (Clean Slate ao Abrir)
- **Descrição**: Modificar a inicialização do app para não carregar imagens de exemplo automaticamente na primeira abertura.
- **Configuração inicial padrão**:
  - Imagens: Nenhuma (moodboard começa 100% limpo, com slot pontilhado convidando para adicionar).
  - Título padrão: `moodboard`
  - Subtítulo padrão: `adicione uma descrição clicando aqui`
- **Acesso ao Exemplo**: As imagens demonstrativas continuam disponíveis sob demanda através do botão **"Exemplo"** na barra superior.

### [ ] 4. Régua de Paleta de Cores Desativada por Padrão
- **Descrição**: O switch *"Régua de Paleta de Cores"* deve vir desligado (`checked = false`) por padrão ao abrir o moodboard.
- **Comportamento**: A extração automática de cores continua disponível nas configurações, mas só será exibida visualmente na borda inferior do quadro se o usuário ativar o switch explicitamente.

---

## 💡 Ideias Futuras (Backlog Secundário)
- [ ] Exportação em formato ZIP com todas as imagens originais compactadas.
- [ ] Suporte a notas adesivas de texto (*post-its* coloridos) intercaladas no grid.
- [ ] Suporte a salvar/carregar projetos em formato `.json` (moodboard presets).
