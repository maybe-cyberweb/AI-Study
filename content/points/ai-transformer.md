# Transformer：Attention、MLP、残差与规范化

## 一层 Transformer 到底做了什么
你可以把一层 Transformer 看成两段：

1) 注意力：跨 token 聚合信息
2) MLP：对每个 token 做非线性变换

两段之间都包着：残差（residual）与规范化（norm）。

## 1) 输入输出
设输入为 X（shape: T x d_model），T 是序列长度。

### 1.1 Attention 子层
1) 线性投影：

- Q = XWq
- K = XWk
- V = XWv

2) 相似度与权重：

- S = QKᵀ / sqrt(d_k)
- A = softmax(S)

3) 聚合：

- Y = A V

多头注意力：多个子空间并行，最后 concat 再投影。

### 1.2 MLP 子层
通常是：

- X -> Linear(d -> 4d) -> 激活 -> Linear(4d -> d)

激活常见是 GELU / SiLU。

## 2) 残差与规范化（Pre-LN）
现代 LLM 多用 Pre-LN：

- X1 = X + Attn(LN(X))
- X2 = X1 + MLP(LN(X1))

直觉：

- 残差让梯度更容易传
- LN 稳定训练数值范围

## 3) 为什么 Attention 能“对齐信息”
Attention 是一个可学习的“相关性路由器”。

- Q 表示“我需要什么”
- K 表示“我有什么”
- V 表示“我能提供什么内容”

## 4) 和推理性能的关系
Attention 的计算复杂度：

- O(T^2) 的注意力矩阵

长上下文下成本非常高，因此：

- KV Cache
- FlashAttention 等优化
- 长上下文策略

## 与项目落地的连接
你们的“干部伴读”是长对话：

- T 变大 -> 成本暴涨
- 必须做摘要压缩与滑动窗口

## 自检清单
- 你能用一句话解释 Q/K/V 的语义吗？
- 你知道 Pre-LN 为什么更稳吗？
- 你能解释为什么长上下文更贵吗？

