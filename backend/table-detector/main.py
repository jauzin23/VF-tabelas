from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import io
from PIL import Image as PILImage
import numpy as np
from transformers import AutoImageProcessor, AutoModelForObjectDetection
import torch

app = FastAPI(title="Table Detection API with TATR", version="2.0.0")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carregar modelo Table Transformer (TATR) do Hugging Face
print("Carregando modelo Table Transformer...")
processor = AutoImageProcessor.from_pretrained("microsoft/table-transformer-detection")
model = AutoModelForObjectDetection.from_pretrained("microsoft/table-transformer-detection")

# Mover para GPU se disponível
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
model.eval()

print(f"Modelo carregado com sucesso! Usando: {device}")


def detect_table_with_tatr(image: PILImage.Image) -> dict:
    """
    Detecta tabelas em imagens usando Table Transformer (TATR).
    
    Retorna:
    - has_table: se há tabelas detectadas
    - confidence: nível de confiança da detecção
    - detections: número de tabelas encontradas
    """
    
    try:
        # Processar imagem
        inputs = processor(images=image, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Fazer predição
        with torch.no_grad():
            outputs = model(**inputs)
        
        # Processar resultados
        target_sizes = torch.tensor([image.size[::-1]])
        results = processor.post_process_object_detection(
            outputs, 
            target_sizes=target_sizes,
            threshold=0.5
        )
        
        # Extrair detecções
        detections = results[0]
        scores = detections["scores"].cpu().numpy()
        labels = detections["labels"].cpu().numpy()
        boxes = detections["boxes"].cpu().numpy()
        
        # Filtrar por confiança
        table_detections = []
        for score, label, box in zip(scores, labels, boxes):
            if score > 0.5:  # Threshold de confiança
                table_detections.append({
                    "score": float(score),
                    "label": int(label),
                    "box": box.tolist()
                })
        
        has_table = len(table_detections) > 0
        avg_confidence = np.mean([d["score"] for d in table_detections]) if table_detections else 0
        
        confidence_level = "muito alta" if avg_confidence > 0.8 else "alta" if avg_confidence > 0.6 else "média"
        
        return {
            "has_table": has_table,
            "tables_detected": len(table_detections),
            "average_confidence": round(float(avg_confidence), 3),
            "confidence_level": confidence_level,
            "detections": table_detections
        }
    
    except Exception as e:
        raise Exception(f"Erro na detecção: {str(e)}")


@app.post("/detect-table")
async def detect_table(file: UploadFile = File(...)):
    """
    Detecta tabelas em uma imagem usando Table Transformer.
    
    - **file**: Arquivo de imagem (jpg, png, etc)
    
    Retorna:
    - has_table: boolean indicando se há tabelas
    - tables_detected: número de tabelas encontradas
    - average_confidence: confiança média das detecções
    - confidence_level: nível de confiança (muito alta/alta/média)
    """
    
    try:
        # Validar tipo de arquivo
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Arquivo deve ser uma imagem")
        
        # Ler o arquivo
        contents = await file.read()
        image_data = io.BytesIO(contents)
        
        # Abrir imagem com PIL
        pil_image = PILImage.open(image_data).convert("RGB")
        
        # Detectar tabelas
        detection_result = detect_table_with_tatr(pil_image)
        
        return JSONResponse(
            status_code=200,
            content={
                "has_table": detection_result["has_table"],
                "message": f"{'Tabela(s) encontrada(s)' if detection_result['has_table'] else 'Nenhuma tabela encontrada'} na imagem",
                "details": {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "tables_detected": detection_result["tables_detected"],
                    "average_confidence": detection_result["average_confidence"],
                    "confidence_level": detection_result["confidence_level"],
                    "detections": detection_result["detections"]
                }
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar imagem: {str(e)}")


@app.get("/health")
async def health_check():
    """Verificar saúde da API"""
    device_info = "GPU (CUDA)" if torch.cuda.is_available() else "CPU"
    return {
        "status": "ok",
        "message": "API está funcionando",
        "device": device_info,
        "model": "Table Transformer (microsoft/table-transformer-detection)"
    }


@app.get("/")
async def root():
    """Endpoint raiz com informações sobre a API"""
    return {
        "name": "Table Detection API",
        "version": "2.0.0",
        "model": "Table Transformer (TATR)",
        "description": "Detecta tabelas em imagens usando um Vision Transformer",
        "endpoints": {
            "detect_table": "POST /detect-table - Detecta tabelas em uma imagem",
            "health": "GET /health - Verifica se a API está funcionando"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
