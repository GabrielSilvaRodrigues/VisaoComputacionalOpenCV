from pyscript import window
from pyodide.ffi import create_proxy
import cv2, numpy as np, base64, json

_state = {"img": None, "cascade": None, "model": None}


def _decode(data_url):
    raw = base64.b64decode(data_url.split(',', 1)[1])
    arr = np.frombuffer(raw, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _encode(img):
    ok, buf = cv2.imencode('.png', img)
    if not ok:
        raise RuntimeError('Falha ao codificar PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.tobytes()).decode()


def _set_status(msg):
    window.setStatus(msg)


def load_image(data_url):
    _state['img'] = _decode(data_url)
    _set_status(f"Loaded {_state['img'].shape[1]}×{_state['img'].shape[0]}")
    return _encode(_state['img'])


def sum_images(data_url_a, data_url_b, weight=0.5):
    img_a = _decode(data_url_a)
    img_b = _decode(data_url_b)
    if img_a.shape[:2] != img_b.shape[:2]:
        img_b = cv2.resize(img_b, (img_a.shape[1], img_a.shape[0]))
    alpha = float(weight)
    result = cv2.addWeighted(img_a, 1.0 - alpha, img_b, alpha, 0)
    _state['img'] = result
    _set_status('Images summed successfully')
    return _encode(result)


def execute(code, data_url=None):
    try:
        if data_url:
            _state['img'] = _decode(data_url)
        if _state['img'] is None:
            raise ValueError('Abra uma imagem primeiro.')
        env = {'cv2': cv2, 'np': np, 'numpy': np, 'img': _state['img'].copy()}
        exec(code, {'__builtins__': __builtins__}, env)
        out = env.get('result', env.get('img'))
        if out is None:
            raise ValueError('O código deve produzir "result" ou "img".')
        if len(out.shape) == 2:
            out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
        if out.dtype != np.uint8:
            out = np.clip(out, 0, 255).astype(np.uint8)
        _state['img'] = out
        _set_status('Code executed successfully')
        return _encode(out)
    except Exception as e:
        _set_status('Error: ' + str(e))
        raise


def process(params_json):
    if _state['img'] is None:
        return None
    p = json.loads(params_json)
    img = _state['img'].copy()
    alpha = float(p['alpha'])
    beta = float(p['beta'])
    gamma = float(p['gamma'])
    img = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
    if abs(gamma - 1) > 1e-3:
        inv = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv) * 255 for i in range(256)]).astype('uint8')
        img = cv2.LUT(img, table)

    blur = p['blur']; k = int(p['kernel'])
    if blur == 'gaussian':
        img = cv2.GaussianBlur(img, (k, k), float(p['sigmaX']), float(p['sigmaY']))
    elif blur == 'median':
        img = cv2.medianBlur(img, k)
    elif blur == 'bilateral':
        img = cv2.bilateralFilter(img, int(p['bd']), float(p['sc']), float(p['ss']))

    morph = p['morph']; mk = int(p['morphK']); it = int(p['iter'])
    if morph != 'none':
        ker = cv2.getStructuringElement(cv2.MORPH_RECT, (mk, mk))
        op = {'erode': cv2.MORPH_ERODE, 'dilate': cv2.MORPH_DILATE, 'open': cv2.MORPH_OPEN, 'close': cv2.MORPH_CLOSE, 'blackhat': cv2.MORPH_BLACKHAT}[morph]
        img = cv2.morphologyEx(img, op, ker, iterations=it)

    tm = p['thresholdMode']
    if tm != 'none':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if tm == 'binary':
            gray = cv2.threshold(gray, int(p['th']), int(p['maxv']), cv2.THRESH_BINARY)[1]
        elif tm == 'otsu':
            gray = cv2.threshold(gray, 0, int(p['maxv']), cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        else:
            gray = cv2.adaptiveThreshold(gray, int(p['maxv']), cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, int(p['block']), int(p['cval']))
        img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    edge = p['edge']; gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if edge == 'canny':
        img = cv2.cvtColor(cv2.Canny(gray, int(p['c1']), int(p['c2'])), cv2.COLOR_GRAY2BGR)
    elif edge in ('sobel', 'scharr'):
        if edge == 'scharr':
            g = cv2.Scharr(gray, cv2.CV_64F, 1, 0)
        else:
            g = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=int(p['sobelK']))
        g = cv2.convertScaleAbs(g)
        img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    elif edge == 'hough':
        e = cv2.Canny(gray, int(p['c1']), int(p['c2']))
        lines = cv2.HoughLinesP(e, 1, np.pi / 180, int(p['ht']), minLineLength=int(p['hmin']), maxLineGap=int(p['hgap']))
        img = img.copy()
        if lines is not None:
            for x1, y1, x2, y2 in lines[:, 0]:
                cv2.line(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
    elif edge == 'circles':
        circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, 1.2, 20, param1=int(p['c1']), param2=max(1, int(p['c2'] / 2)), minRadius=int(p['rmin']), maxRadius=int(p['rmax']))
        img = img.copy()
        if circles is not None:
            for x, y, r in np.uint16(np.around(circles[0])):
                cv2.circle(img, (x, y), r, (255, 0, 255), 2)

    noise = float(p['noise'])
    if noise > 0:
        img = np.clip(img.astype(np.float32) + np.random.normal(0, noise, img.shape), 0, 255).astype(np.uint8)
    if int(p['dh']) > 0:
        img = cv2.fastNlMeansDenoisingColored(img, None, int(p['dh']), int(p['dhc']), 7, 21)

    if not (p['hueMin'] == 0 and p['hueMax'] == 179 and p['satMin'] == 0 and p['satMax'] == 255 and p['valMin'] == 0 and p['valMax'] == 255):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        lo = np.array([int(p['hueMin']), int(p['satMin']), int(p['valMin'])])
        hi = np.array([int(p['hueMax']), int(p['satMax']), int(p['valMax'])])
        img = cv2.bitwise_and(img, img, mask=cv2.inRange(hsv, lo, hi))

    scale = float(p['scale']); angle = float(p['angle']); tx = int(p['tx']); ty = int(p['ty'])
    h, w = img.shape[:2]
    if abs(scale - 1) > 1e-4:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    if abs(angle) > 1e-4 or tx or ty:
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        M[0, 2] += tx
        M[1, 2] += ty
        img = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=(20, 20, 20))
    return _encode(img)


def version():
    return cv2.__version__


window.editorLoad = create_proxy(load_image)
window.editorProcess = create_proxy(process)
window.editorExecute = create_proxy(execute)
window.editorSum = create_proxy(sum_images)
window.editorVersion = version()
_set_status('Python/OpenCV ready')
