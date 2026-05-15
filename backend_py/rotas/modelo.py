from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
from servicos.detetor_tabelas import detetar_tabelas_em_imagem
from utilitarios.registo import registo

rota = APIRouter(prefix="/api/modelo", tags=["modelo"])

@rota.post("/detetar-tabela")
async def api_detetar_tabela(ficheiro: UploadFile = File(...)):
    """
    Detects tables in an image.
    
    Returns: List of detections
    [
      {
        "etiqueta": "table",
        "pontuacao": 0.95,
        "motivo": "Tabela detectada"
      }
    ]
    
    Returns empty array [] if no table detected.
    """
    id_temp = str(uuid.uuid4())
    ext = os.path.splitext(ficheiro.filename)[1]
    caminho_temp = f"temp_{id_temp}{ext}"
    
    try:
        with open(caminho_temp, "wb") as buffer:
            shutil.copyfileobj(ficheiro.file, buffer)
        
        resultado, _ = await detetar_tabelas_em_imagem(caminho_temp)
        
        registo.debug(f"Image detection raw result: {resultado}")
        
        # Ensure resultado is always a dict
        if not isinstance(resultado, dict):
            registo.warning(f"Unexpected resultado type: {type(resultado)}, value: {resultado}")
            return JSONResponse(content=[])
        
        # Convert response to format for frontend
        tem_tabela = resultado.get("tem_tabela", False)
        
        registo.debug(f"tem_tabela={tem_tabela}")
        
        return JSONResponse(content={"tem_tabela": tem_tabela})
        
    except Exception as e:
        registo.error(f"Error processing image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao processar imagem: {str(e)}")
    finally:
        if os.path.exists(caminho_temp):
            os.remove(caminho_temp)