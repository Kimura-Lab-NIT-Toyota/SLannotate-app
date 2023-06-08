from collections.abc import Sequence
from itertools import product

from .others import _ALL

__all__ = _ALL()

@__all__
class LCS:
  def __init__(self, a : Sequence, b : Sequence):
    """LCS(最長共通部分列)を取得するオブジェクトを作成

    Note:
        aとbの内部のデータ型は同じである必要がある

    Args:
        a (Sequence): 比較対象１
        b (Sequence): 比較対象２

    Raises:
        ValueError: 内部のデータが異なる
    """
    if type(a) != type(b): raise ValueError(f"different type between {type(a)} and {type(b)}")
    self.__type = type(a)
    self.__a = a
    self.__b = b
    DP = [[0 for j in range(len(self.__b) + 1)] for i in range(len(self.__a) + 1)]

    for i, j in product(range(len(self.__a)), range(len(self.__b))):
      if self.__a[i] == self.__b[j]:
        DP[i+1][j+1] = DP[i][j] + 1
      else:
        DP[i+1][j+1] = max(DP[i+1][j], DP[i][j+1])

    self.__DP : list[list[int]] = DP
    self.__lcs_len : int = None
    self.__lcs : list[dict[tuple[int, int], list[tuple[int, int]]]] = None

  @property
  def DP(self):
    """動的計画法の計算領域を取得"""
    return self.__DP

  @property
  def DPshape(self):
    """動的計画法の計算領域のサイズを取得"""
    return (len(self.__a), len(self.__b))

  def lcs_len(self):
    """最長共通部分列の長さを取得"""
    if self.__lcs_len == None: self.__lcs_len = self.__DP[-1][-1]
    return self.__lcs_len

  __len__ = lcs_len

  def lcs(self, print_flag = False):
    """ 動的計画法を行い、最長共通部分列の長さを求める
    動的計画法の結果はオブジェクトに保存され、2回目以降は動的計画法しない

    Args:
        print_flag (bool, optional): 動的計画法の動きを表示する. Defaults to False.

    Returns:
        list[dict[tuple[int, int], list[tuple[int, int]]]]: 探索経過
    """
    if self.__lcs != None and not print_flag: return self.__lcs
    ret : list[dict[tuple[int, int], list[tuple[int, int]]]] = [dict() for i in range(self.__DP[-1][-1] + 1)]
    stack : list[tuple[tuple[int, int], tuple[int, int]]] = [((len(self.__a), len(self.__b)), (-1, -1))]
    while len(stack) > 0:
      (i, j), past_collect = stack.pop()
      if print_flag: print(f"({i} : {self.__a[i-1]}, {j} : {self.__b[j-1]}) <- {past_collect}", end=" ")
      if i == 0 and j == 0:
        if not (0, 0) in ret[0].keys():
          ret[0][(0, 0)] = [past_collect]
        elif not past_collect in ret[0][(0, 0)]:
          ret[0][(0, 0)].append(past_collect)
      elif self.__DP[i-1][j-1] == self.__DP[i-1][j] == self.__DP[i][j-1] == self.__DP[i][j] - 1:
        if not (i, j) in ret[self.__DP[i][j]].keys():
          ret[self.__DP[i][j]][(i, j)] = [past_collect]
          stack.append(((i-1, j-1), (i, j)))
        elif not past_collect in ret[self.__DP[i][j]][(i, j)]:
          ret[self.__DP[i][j]][(i, j)].append(past_collect)
          stack.append(((i-1, j-1), (i, j)))
      else:
        if i >= 0 and j >  0:
          if self.__DP[i  ][j-1] == self.__DP[i][j]:
            stack.append(((i  , j-1), past_collect))
        if i >  0 and j >= 0:
          if self.__DP[i-1][j  ] == self.__DP[i][j]:
            stack.append(((i-1, j  ), past_collect))
      if print_flag: print()
    self.__lcs = ret
    return ret

  def __gen(self):
    self.lcs()
    if len(self) <= 0: return
    stack : list[tuple[int, tuple[int, int]]] = [(0, (0, 0))]
    ret   : list[tuple[int, int]] = [(0, 0) for _ in range(len(self) + 1)]
    while len(stack) > 0:
      depth, idx = stack.pop()
      ret[depth] = idx
      if depth >= len(self):
        if self.__type == str: yield "".join(self.__a[i-1] for i, j in ret[1: depth + 1])
        else:                  yield [self.__a[i-1] for i, j in ret[1: depth + 1]]
        continue
      for n in self.__lcs[depth][idx]:
        stack.append((depth + 1, n))

  def __iter__(self):
    return self.__gen()

@__all__
class PartFind():
  def __init__(self, pred, true):
    """部分一致を取得する

    Args:
        pred (Sequence): 予測系列
        true (Sequence): 正解系列
    """
    self.pred = pred
    self.true = true
    self.lcs = LCS(self.pred, self.true)

  def foward_maxchain(self):
    """正解と予測の、文の先頭からの連続一致部分列を取得し、そのうちの1つを取得"""
    i = 0
    while self.true[i] == self.pred[i]: i += 1
    return next(iter(self.lcs))[:i]

  def backward_maxchain(self):
    """正解と予測の、文の末尾からの連続一致部分列を取得し、そのうちの1つを取得"""
    i = 0
    while self.true[i-1] == self.pred[i-1]: i -= 1
    return next(iter(self.lcs))[i:]

  def maxchain(self):
    """最大連続部分列を取得"""
    DP = [[0 for t in range(len(self.true) + 1)] for p in range(len(self.pred) + 1)]
    max_chain_num = 0
    max_chain_idx = -1
    for p in range(len(self.pred)):
      for t in range(len(self.true)):
        if self.pred[p] == self.true[t]:
          DP[p+1][t+1] = DP[p][t] + 1
        if DP[p+1][t+1] > max_chain_num:
          max_chain_num = DP[p+1][t+1]
          max_chain_idx = t+1
    return self.true[max_chain_idx - max_chain_num: max_chain_idx]