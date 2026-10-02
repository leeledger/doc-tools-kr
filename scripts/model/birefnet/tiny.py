"""KB-size stand-in model for the e2e page flow (brief C2 Test map; the e2e serves it with Playwright page.route in
place of the real parts, so the page code has no test hook). Same I/O as the export: `input_image` 1x3x512x512
float32 (ImageNet-normalised) -> `output_image` 1x1x512x512 float32 in 0..1:

    output = sigmoid(-4 * (mean over channels(input) - 0.8))

A saturated or dark subject (normalised channel mean below ~0.8) on a light grey background (~2.0) becomes ~1, the
background ~0; a flat light image has no subject. Opset 17, four nodes, a few hundred bytes. Needs only `onnx`
(+ onnxruntime for the self-check):  python scripts/model/birefnet/tiny.py
Writes tests/fixtures/bgremove/tiny.onnx.
"""
import os

import numpy as np
import onnx
from onnx import TensorProto, helper

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'bgremove', 'tiny.onnx')


def build():
    x = helper.make_tensor_value_info('input_image', TensorProto.FLOAT, [1, 3, 512, 512])
    y = helper.make_tensor_value_info('output_image', TensorProto.FLOAT, [1, 1, 512, 512])
    t = helper.make_tensor('t', TensorProto.FLOAT, [], [0.8])
    k = helper.make_tensor('k', TensorProto.FLOAT, [], [-4.0])
    nodes = [
        helper.make_node('ReduceMean', ['input_image'], ['m'], axes=[1], keepdims=1),
        helper.make_node('Sub', ['m', 't'], ['d']),
        helper.make_node('Mul', ['d', 'k'], ['z']),
        helper.make_node('Sigmoid', ['z'], ['output_image']),
    ]
    g = helper.make_graph(nodes, 'docttak-tiny-mask', [x], [y], initializer=[t, k])
    m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)], producer_name='docttak-e2e')
    m.ir_version = 8
    onnx.checker.check_model(m)
    return m


if __name__ == '__main__':
    m = build()
    onnx.save(m, OUT)
    import onnxruntime as ort
    s = ort.InferenceSession(OUT, providers=['CPUExecutionProvider'])
    mean, std = np.array([0.485, 0.456, 0.406])[:, None, None], np.array([0.229, 0.224, 0.225])[:, None, None]
    grey = ((np.full((3, 512, 512), 0.9) - mean) / std)[None].astype(np.float32)
    red = ((np.array([0.85, 0.1, 0.1])[:, None, None] * np.ones((3, 512, 512)) - mean) / std)[None].astype(np.float32)
    print(os.path.getsize(OUT), 'bytes; grey', float(s.run(None, {'input_image': grey})[0].mean()), 'red', float(s.run(None, {'input_image': red})[0].mean()))
