import requests

BASE_URL = "http://localhost:8000"

def run_tests():
    print("Starting Whitebox API Tests...")
    
    # 1. Health check
    try:
        r = requests.get(f"{BASE_URL}/")
        assert r.status_code == 200
        print("✅ Health check passed")
    except Exception as e:
        print(f"❌ Health check failed: {e}")

    # 2. Predict Category
    try:
        payload = {"description": "Starbucks Coffee"}
        r = requests.post(f"{BASE_URL}/api/predict", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["category"] in ["Coffee", "Food", "Other"]
        print(f"✅ Predict Category passed: {data}")
    except Exception as e:
        print(f"❌ Predict Category failed: {e}")
        
    print("Tests complete!")

if __name__ == "__main__":
    run_tests()
