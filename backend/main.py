from fastapi import FastAPI

app = FastAPI()

#SIEMPRE AL TRABAJAR EN BACKEND USAR ESTE COMANDO EN EL TERMINAL: 
#source venv/bin/activate

@app.get("/")
def root():
    return {"message": "API funcionando"}