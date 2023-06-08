import itertools
import collections
from typing import TypeVar
import torch
import torch.nn as nn

class _ALL(list[str]):
  def __call__(self, __obj):
    self.append(__obj.__name__)
    return __obj
__all__ = _ALL()

_T = TypeVar("_T")

@__all__
def _CTCdecode(target: torch.Tensor, length: torch.Tensor, blank: int) -> tuple[torch.Tensor, torch.Tensor]:
  """
  Args:
      target (torch.Tensor): with shape (T,)
      length (torch.Tensor): with shape ()
      blank (int): blank index

  Returns:
      tuple[torch.Tensor, torch.Tensor]:
          #0: decoded target with shape (T,)
          #1: length of decoded target with shape ()
  """
  # グループ化
  group = itertools.groupby(target[:length])
  # 縮約
  sequence = torch.tensor(tuple(k for k, g in group if k != blank), dtype=target.dtype)
  return sequence, torch.tensor(len(sequence))

@__all__
def CTCdecode(target: torch.Tensor, length: torch.Tensor, blank: int = 0) -> tuple[torch.Tensor, torch.Tensor]:
  if len(target.shape) == 1:
    res = _CTCdecode(target, length, blank)
    return res
  if len(target.shape) == 2:
    res = (_CTCdecode(t, l, blank) for t, l in zip(target, length))
    p, l = zip(*res)
    return nn.utils.rnn.pad_sequence(p, batch_first=True), torch.tensor(l)

def str_format(self: str, *args: object, **kwargs: object) -> str:
  """Format the string using the specified arguments.

  This function is similar to the built-in `str.format()` method, but it only replaces placeholders in the string that
  have corresponding keyword arguments in `kwargs`.

  Args:
      self (str): The string to be formatted.
      *args: Positional arguments to be used in the string formatting.
      **kwargs: Keyword arguments to be used in the string formatting.

  Returns:
      The formatted string.
  """
  __dict = dict((k, v) for k, v in kwargs.items() if f"{{{k}}}" in self)
  return str.format(self, *args, **__dict)

number = int | float | bool

class moving:

  def __init__(self, n: int):
    """
    Args:
        n (int): ウィンドウサイズ
    """
    raise NotImplementedError

  def step(self, x: number):
    """
    Args:
        x (number): 追加するエントリ
    Returns:
        None | number: 現在の値
        十分なエントリを格納していないとき、Noneになる
    """
    raise NotImplementedError

@__all__
class moving_median(moving):

  def __init__(self, n: int):

    self.n = n
    self.half_n = n // 2
    self.is_odd = n % 2 == 0
    self.dq = collections.deque(maxlen = self.n + 1)

    self.window = [0]
    self.step(0)

  def step(self, x):

    self.dq.append(x)
    for i, w in enumerate(itertools.chain(self.window, [x])):
      if x >= w:
        self.window.insert(i, x)
        break

    if len(self.dq) > self.n:
      self.window.remove(self.dq.popleft())
      if self.is_odd:
        return self.window[self.half_n]
      else:
        return (self.window[self.half_n - 1] + self.window[self.half_n]) / 2

@__all__
class moving_average(moving):

  def __init__(self, n: int):

    self.n = n
    self._average = 0.0
    self.dq = collections.deque(maxlen = self.n + 1)

    self.step(0)

  def step(self, x):

    self.dq.append(x_new := x / self.n)
    self._average += x_new
    if len(self.dq) > self.n:
      x_old = self.dq.popleft()
      self._average -= x_old
      return self._average
