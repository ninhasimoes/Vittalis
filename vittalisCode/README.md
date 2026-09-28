# Vittalis

Módulo de saúde hiperpersonalizada, desenvolvido como projeto do Challenge FIAP 2026 em parceria com a Unimed Nacional.

O Vittalis acompanha hábitos diários do usuário (humor, sono, atividade física e água) e usa inteligência artificial generativa (Gemini API) para gerar recomendações personalizadas de saúde, calculadas a partir do diário e do perfil de cada pessoa.

## Equipe

- Ana Luiza Simões
- Manuella Pasqualini
- Giovana Mazzei
- Rayssa Moraes

## Tecnologias

- **Front-end:** HTML, CSS e JavaScript puro
- **Back-end:** Python (FastAPI)
- **Inteligência Artificial:** Google Gemini API
- **Armazenamento (protótipo atual):** localStorage do navegador

## Como rodar o projeto localmente

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1          # Windows (PowerShell)
pip install -r requirements.txt
```

Crie um arquivo `.env` dentro da pasta `backend` (use o `.env.example` como modelo) e adicione sua chave da API do Gemini:

```
GEMINI_API_KEY="sua_chave_aqui"
```

Depois, suba o servidor:

```bash
python -m uvicorn api_vittalis:app --reload --port 8000
```

### 2. Front-end

Com o backend rodando, abra o arquivo `vittalis-site/index.html` diretamente no navegador (ou sirva a pasta com uma extensão tipo Live Server).

## Estado atual do projeto

Este é um protótipo acadêmico. As funcionalidades de quiz, Índice Viva, diário, metas e recomendação por IA estão funcionais e conectadas de ponta a ponta. Fluxos complementares (pagamento do plano Premium e recompensas) ainda estão em estágio de protótipo/simulação.