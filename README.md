# OpenCV Studio — PyScript + cv2

Editor de imagens no navegador com estética inspirada no VS Code, pipeline visual e editor Python sincronizado.

## Execução

Use um servidor HTTP local (não abra o HTML via `file://`):

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

O projeto carrega PyScript/Pyodide pelo CDN e o pacote `opencv-python` do repositório de pacotes Pyodide. O processamento de imagem é executado no WebAssembly dentro do navegador, sem backend. O catálogo oficial do Pyodide atualmente inclui `opencv-python` e `numpy`. 

## Recursos

- Interface dark inspirada no VS Code.
- Upload, preview, drag & drop e exportação PNG.
- Sliders para contraste/brilho/gamma, blur, morfologia, threshold, Canny/Sobel/Scharr/Hough, ruído/denoise, HSV, geometria e parâmetros Haar/DNN.
- Pipeline visual.
- Gerador de código Python com `cv2` + `numpy`.
- Modo código: edite o script e clique em **Run Code**.
- Haar Cascade XML e arquivos de modelos DNN podem ser carregados para extensão futura; o processamento base é local.

## Observação sobre DNN

Modelos DNN não são incluídos no ZIP porque são arquivos grandes e variam conforme a tarefa. A interface aceita modelos `.onnx`, `.pb`, `.caffemodel` e prototxt para uma camada de integração local.

## Estrutura

- `index.html` — shell da aplicação e layout.
- `styles.css` — tema VS Code.
- `app.js` — UI, sincronização, pipeline e editor.
- `app.py` — processamento real com `cv2`/`numpy` via PyScript.
