"""Port of spike tools/fix_wide_ops.py as an importable function.
Rewrites Split/Concat nodes with more than MAXN outputs/inputs into trees of <= MAXN so WebGPU
shaders stay under the per-stage storage-buffer limit. Pure graph rewrite, numerically identical
(parity.py proves it)."""
import numpy as np
from onnx import helper, numpy_helper


def fix_wide_ops(m, maxn=6):
    g = m.graph
    inits = {i.name: numpy_helper.to_array(i) for i in g.initializer}
    for n in g.node:
        if n.op_type == 'Constant':
            for a in n.attribute:
                if a.name == 'value':
                    inits[n.output[0]] = numpy_helper.to_array(a.t)
    cnt = [0]

    def uniq(p):
        cnt[0] += 1
        return f'{p}__w{cnt[0]}'

    def const_i64(vals):
        name = uniq('split_sizes')
        g.initializer.append(numpy_helper.from_array(np.array(vals, np.int64), name))
        return name

    def concat_tree(inputs, output, axis, name):
        if len(inputs) <= maxn:
            return [helper.make_node('Concat', inputs, [output], axis=axis, name=name)]
        nodes, mids = [], []
        for i in range(0, len(inputs), maxn):
            chunk = inputs[i:i + maxn]
            if len(chunk) == 1:
                mids.append(chunk[0]); continue
            o = uniq(name + '_c')
            nodes.append(helper.make_node('Concat', chunk, [o], axis=axis, name=uniq(name)))
            mids.append(o)
        return nodes + concat_tree(mids, output, axis, uniq(name))

    new = []; nsplit = nconcat = 0
    for n in g.node:
        if n.op_type == 'Concat' and len(n.input) > maxn:
            axis = [a.i for a in n.attribute if a.name == 'axis'][0]
            new += concat_tree(list(n.input), n.output[0], axis, n.name); nconcat += 1; continue
        if n.op_type == 'Split' and len(n.output) > maxn:
            axis = next((a.i for a in n.attribute if a.name == 'axis'), 0)
            if len(n.input) > 1 and n.input[1]:
                sizes = list(inits[n.input[1]])
            else:
                sizes = next((list(a.ints) for a in n.attribute if a.name == 'split'), None)
                if sizes is None:
                    raise SystemExit('equal split without sizes not handled: ' + n.name)
            outs = list(n.output)
            groups = [list(range(i, min(i + maxn, len(outs)))) for i in range(0, len(outs), maxn)]
            if len(groups) > maxn:
                raise SystemExit('too many groups')
            gsz = [int(sum(sizes[j] for j in gr)) for gr in groups]
            gouts = [uniq(n.name + '_g') for _ in groups]
            new.append(helper.make_node('Split', [n.input[0], const_i64(gsz)], gouts, axis=axis, name=uniq(n.name)))
            for gr, go in zip(groups, gouts):
                if len(gr) == 1:
                    new.append(helper.make_node('Identity', [go], [outs[gr[0]]], name=uniq(n.name)))
                else:
                    new.append(helper.make_node('Split', [go, const_i64([int(sizes[j]) for j in gr])],
                                                [outs[j] for j in gr], axis=axis, name=uniq(n.name)))
            nsplit += 1; continue
        new.append(n)
    del g.node[:]
    g.node.extend(new)
    return nsplit, nconcat
