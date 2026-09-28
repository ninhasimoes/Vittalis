import os
from enum import Enum

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types, errors
from pydantic import BaseModel, Field

# ==========================================
# CONFIGURAÇÃO DA IA (GEMINI)
# ==========================================
load_dotenv()
client = genai.Client()
MODELO_ESCOLHIDO = "gemini-3.6-flash"


class NivelRisco(str, Enum):
    BAIXO = "baixo"
    MODERADO = "moderado"
    ALTO = "alto"


class InsightDiario(BaseModel):
    mensagem: str = Field(description="Mensagem breve, acolhedora e personalizada sobre o dia do paciente")
    nivel_risco: NivelRisco
    recomendacoes: list[str] = Field(description="Até 2 ações práticas sugeridas")


def gerar_insight(dados_paciente: str):
    prompt_sistema = (
        "Você é o assistente de insights diários do Vittalis, um app de saúde. "
        "Com base nos dados de hoje informados sobre o paciente, escreva uma mensagem breve, "
        "acolhedora e personalizada, destacando algo positivo ou um ponto de atenção. "
        "Classifique também o nível de risco geral e sugira até 2 recomendações práticas. "
        "Não forneça diagnóstico médico, apenas uma orientação inicial."
    )
    try:
        response = client.models.generate_content(
            model=MODELO_ESCOLHIDO,
            contents=dados_paciente,
            config=types.GenerateContentConfig(
                system_instruction=prompt_sistema,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=InsightDiario,
            ),
        )
        return response.parsed
    except errors.APIError as e:
        print(f"Erro na chamada à API (código {e.code}): {e.message}")
        return None


# ==========================================
# SERVIDOR (FASTAPI)
# ==========================================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DadosDiario(BaseModel):
    humor: str
    sono: float
    atividade: float
    agua: float


@app.post("/api/insight")
def endpoint_insight(dados: DadosDiario):
    texto_para_ia = (
        f"Humor registrado: {dados.humor}. "
        f"Horas de sono: {dados.sono}h. "
        f"Atividade física: {dados.atividade} minutos. "
        f"Água consumida: {dados.agua} copos."
    )
    resultado = gerar_insight(texto_para_ia)

    if resultado:
        return {
            "mensagem": resultado.mensagem,
            "nivel_risco": resultado.nivel_risco,
            "recomendacoes": resultado.recomendacoes,
        }
    return {"mensagem": "Não foi possível gerar uma recomendação no momento. Continue registrando seus hábitos!"}