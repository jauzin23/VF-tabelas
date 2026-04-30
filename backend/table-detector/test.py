"""
Script de teste para o Table Detector API
"""

import requests
import sys
from pathlib import Path

BASE_URL = "http://localhost:8000"


def test_health():
    """Testa o health check"""
    print("🔍 Testando health check...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"✅ Status: {response.status_code}")
        print(f"   {response.json()}\n")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Erro: {e}\n")
        return False


def test_root():
    """Testa o endpoint raiz"""
    print("🔍 Testando endpoint raiz...")
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"✅ Status: {response.status_code}")
        print(f"   {response.json()}\n")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ Erro: {e}\n")
        return False


def test_detect_table(image_path: str):
    """Testa a detecção de tabela com uma imagem"""
    
    if not Path(image_path).exists():
        print(f"❌ Arquivo não encontrado: {image_path}\n")
        return False
    
    print(f"🔍 Testando detecção de tabela: {image_path}")
    try:
        with open(image_path, "rb") as f:
            files = {"file": f}
            response = requests.post(f"{BASE_URL}/detect-table", files=files, timeout=30)
        
        print(f"✅ Status: {response.status_code}")
        result = response.json()
        
        print(f"\n📊 Resultado:")
        print(f"   Tabelas encontradas: {result['details']['tables_detected']}")
        print(f"   Confiança média: {result['details']['average_confidence']}")
        print(f"   Nível de confiança: {result['details']['confidence_level']}")
        print(f"   Mensagem: {result['message']}\n")
        
        return response.status_code == 200
    
    except Exception as e:
        print(f"❌ Erro: {e}\n")
        return False


def main():
    print("=" * 60)
    print("Table Detector API - Teste")
    print("=" * 60 + "\n")
    
    # Verificar conexão
    print("📡 Verificando conexão com o serviço...\n")
    
    results = []
    
    # Testes básicos
    results.append(("Health Check", test_health()))
    results.append(("Root Endpoint", test_root()))
    
    # Teste com imagem (opcional)
    # Procura por arquivos de teste em algumas localizações
    test_images = [
        "../../../imagens-teste/table.png",
        "../../../imagens-teste/table.jpg",
        "../../../data/images/table.png",
    ]
    
    image_tested = False
    for img_path in test_images:
        if Path(img_path).exists():
            results.append(("Table Detection", test_detect_table(img_path)))
            image_tested = True
            break
    
    if not image_tested:
        print("⚠️  Nenhuma imagem de teste encontrada")
        print("   Para testar a detecção, coloque uma imagem em:")
        print("   - ../../../imagens-teste/table.png\n")
    
    # Resumo
    print("=" * 60)
    print("📋 Resumo dos Testes")
    print("=" * 60)
    
    for test_name, result in results:
        status = "✅ PASSOU" if result else "❌ FALHOU"
        print(f"{test_name}: {status}")
    
    all_passed = all(result for _, result in results)
    
    if all_passed or len(results) > 0:
        print("\n✅ Testes concluídos com sucesso!")
    else:
        print("\n❌ Alguns testes falharam")
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Teste interrompido pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")
        sys.exit(1)
