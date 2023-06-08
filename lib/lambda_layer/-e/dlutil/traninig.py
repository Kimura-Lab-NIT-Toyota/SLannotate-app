from typing import Sequence, Iterable, Iterator, Callable, Concatenate, TypeVar, ParamSpec, TypeAlias
from threading import get_ident
from concurrent.futures import ThreadPoolExecutor, Future
from itertools import count

import torch
import torch.nn as nn, torch.optim as optim
from torch import Tensor
from torch.utils.data import DataLoader
import torchaudio

from .TqdmWrapper import my_tqdm as tqdm
from .others import CTCdecode, _ALL

__all__ = _ALL()
_T = TypeVar("_T")
_P = ParamSpec("_P")

@__all__
def learn(
  train_loader: DataLoader, test_loader: DataLoader,
  model: nn.Module, optimizer: optim.Optimizer, criterion: nn.Module,
  epoch: Sequence[int],
  *,
  device: torch.device | str | None = None,
  epoch_end: int | None = None,
  forward_kwds: dict[str, any] = {},
  tqdm_kwds: dict[str, any] = {}
  ):
  """モデルを学習する

  Args:
      train_loader (DataLoader): 学習データ
      test_loader (DataLoader): テストデータ
      model (nn.Module): モデル
      optimizer (optim.Optimizer): 最適化関数
      criterion (nn.Module): 損失関数
      epoch (Sequence[int]): エポック
      *
      device (torch.device | str | None, optional): 入力データの存在場所。デフォルトはモデルの場所
      epoch_end (int | None, optional): エポックの分母 デフォルトはepochの最後の値
      forward_kwds (dict[str, any], optional): モデルの順伝搬のキーワード引数
      tqdm_kwds (dict[str, any], optional): プログレスバーのキーワード引数

  Note:
      エポックの例 
      >>> arange(10) # 0/9 -> 9/9
      >>> torch.arange(10) + 1 # 1/10 -> 10/10
  """

  if device is None:
    device = next(model.parameters()).device
    # if model has no parameter, may be raise StopIterator

  if epoch_end is None:
    epoch_end = list(epoch)[-1]
  
  for _epoch in epoch:
    try:
      progress = tqdm(train_loader, unit="batch", desc=f"{_epoch:3d}/{epoch_end}", **tqdm_kwds)
      postfix = {}

      loss_sum = 0.0
      i: Tensor; ilen: Tensor; t: Tensor; tlen: Tensor; o: Tensor; olen: Tensor; loss: Tensor
      for _batch, (i, ilen, t, tlen) in enumerate(progress, 1):

        i, ilen, t, tlen = i.to(device), ilen.to(device), t.to(device), tlen.to(device)

        o, olen = model(i, ilen, **forward_kwds)
        loss = criterion(o.transpose(0, 1), t, olen, tlen)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        loss_sum += loss.item()
        postfix["train_loss"] = loss_sum / _batch
        progress.set_postfix(postfix)

      i = ilen = t = tlen = o = olen = loss = None

      loss_sum = 0.0
      for _batch, (i, ilen, t, tlen) in enumerate(test_loader, 1):

        i, ilen, t, tlen = i.to(device), ilen.to(device), t.to(device), tlen.to(device)
        
        o, olen = model(i, ilen, **forward_kwds)
        loss = criterion(o.transpose(0, 1), t, olen, tlen)

        loss_sum += loss.item()
        postfix["test_loss"] = loss_sum / _batch
        progress.set_postfix(postfix)

    finally:
      progress = None

def _detect_one_sumple(
  o: torch.Tensor, olen: torch.Tensor,
  t: torch.Tensor, tlen: torch.Tensor,
  ignore_indices: Sequence[int]) -> dict[str, int | float]:
  """将来のための予約
  Args:
      o (Tensor): [T]
      olen (Tensor): []
      t (Tensor): [T]
      tlen (Tensor): []
      ignore_indices (Sequence[int]): 除外するクラス（単語）番号
  
  関数 `detect` の以下のインデントブロックを移植する

  ```
  for oo, oolen, tt, ttlen in zip(o, olen, t, tlen):
    ...
  ```
    
  Returns:
      `dict[str, int | float]`
  """
  raise NotImplementedError
  
  normalized_levenshtein_distance = torchaudio.functional.edit_distance(o[:olen], t[:tlen]) / max(olen, tlen)
  ret[ "all_perfect"] = 1 if normalized_levenshtein_distance == 0.0 else 0
  ret[ "all_never"  ] = 1 if normalized_levenshtein_distance == 1.0 else 0
  ret[ "all_WER"    ] = normalized_levenshtein_distance
  
  oo_idx = torch.prod(torch.stack([o[:olen] != idx for idx in ignore_indices])).nonzero(as_tuple=True)
  oo = o[oo_idx]
  oolen = len(oo)
  tt_idx = torch.prod(torch.stack([t[:tlen] != idx for idx in ignore_indices])).nonzero(as_tuple=True)
  tt = t[ttlen]
  ttlen = len(tt)
  
  normalized_levenshtein_distance = torchaudio.functional.edit_distance(oo, tt) / max(olen, tlen)
  ret["part_perfect"] = 1 if normalized_levenshtein_distance == 0.0 else 0
  ret["part_never"  ] = 1 if normalized_levenshtein_distance == 1.0 else 0
  ret["part_WER"    ] = normalized_levenshtein_distance
  
  return ret

def _detect_reduce(__map_return: Iterable[dict[str, int | float]]):
  raise NotImplementedError
  map_return = list(__map_return)
  summary = {
    "total": 0,
    "all_perfect":  0, "all_perfect_p":  None, "all_never":  0, "all_never_p":  None, "all_WER":  0.0,
    "part_perfect": 0, "part_perfect_p": None, "part_never": 0, "part_never_p": None, "part_WER": 0.0
  }
  dict((k, map(lambda k: sum(s[k] for s in map_reexturn.values()), zip(*map_return))) for k in map_return[0].keys())

@__all__
def detect(
  test_loader: DataLoader,
  model: nn.Module,
  ignore_indices: Sequence[int],
  *,
  device: torch.device | str | None = None,
  forward_kwds: dict[str, any] = {}
  ):
  """モデルを検証する

  Args:
      test_loader (DataLoader): テストデータ
      model (nn.Module): モデル
      ignore_indices (Sequence[int]): スキップする単語のインデックス
      *
      device (torch.device | str | None, optional): 入力データの存在場所。デフォルトはモデルの場所
      forward_kwds (dict[str, any], optional): モデルの順伝搬のキーワード引数

  Returns:
      dict[str, any]: 検証結果のdict
  """

  if device is None:
    device = next(model.parameters()).device

  i: Tensor; ilen: Tensor; t: Tensor; tlen: Tensor; o: Tensor; olen: Tensor

  summary = {
    "total": 0,
    "all_perfect":  0, "all_perfect_p":  None, "all_never":  0, "all_never_p":  None, "all_WER":  0.0,
    "part_perfect": 0, "part_perfect_p": None, "part_never": 0, "part_never_p": None, "part_WER": 0.0
  }

  for _batch, (i, ilen, t, tlen) in enumerate(test_loader, 1):

    i, ilen = i.to(device), ilen.to(device)

    o, olen = model(i, ilen, **forward_kwds)
    o = torch.argmax(o, dim=-1)
    o, olen = CTCdecode(o, olen)

    o, olen = o.detach().cpu(), olen.detach().cpu()

    # map(_detect_one_sample, zip(o, olen, t, tlen, [ignore_indices] * o.shape[0]))

    for oo, oolen, tt, ttlen in zip(o, olen, t, tlen):

      summary["total"] += 1

      normalized_levenshtein_distance = torchaudio.functional.edit_distance(oo[:oolen], tt[:ttlen]) / max(oolen, ttlen)
      if normalized_levenshtein_distance == 0.0:
        summary["all_perfect"] += 1
      if normalized_levenshtein_distance == 1.0:
        summary["all_never"] += 1
      summary["all_WER"] += normalized_levenshtein_distance

      ooo_idx = torch.prod(torch.stack([(oo[:oolen] != idx) for idx in ignore_indices]), 0).nonzero(as_tuple=True)
      ooo = oo[ooo_idx]
      ooolen = len(ooo)
      ttt_idx = torch.prod(torch.stack([(tt[:ttlen] != idx) for idx in ignore_indices]), 0).nonzero(as_tuple=True)
      ttt = tt[ttt_idx]
      ttt_len = len(ttt)

      normalized_levenshtein_distance = torchaudio.functional.edit_distance(ooo, ttt) / max(ooolen, ttt_len)
      if normalized_levenshtein_distance == 0.0:
        summary["part_perfect"] += 1
      if normalized_levenshtein_distance == 1.0:
        summary["part_never"] += 1
      summary["part_WER"] += normalized_levenshtein_distance
  
  summary[ "all_perfect_p"] = summary[ "all_perfect"] / summary["total"]
  summary[ "all_never_p"  ] = summary[ "all_never"  ] / summary["total"]
  summary[ "all_WER"      ] = summary[ "all_WER"    ] / summary["total"]
  summary["part_perfect_p"] = summary["part_perfect"] / summary["total"]
  summary["part_never_p"  ] = summary["part_never"  ] / summary["total"]
  summary["part_WER"      ] = summary["part_WER"    ] / summary["total"]

  return summary

@__all__
def update_dropout(self: nn.Module, p: float):
  """ドロップアウト率を変更する"""
  for m in self.modules():
    if isinstance(m, nn.Dropout):
      m.p = p

@__all__
def head(x: torch.Tensor, head: int = 1) -> torch.Tensor:
  """
  Args:
      x (Tensor): [N, T, D]
      head (int): slice_stop
  
  Returns:
      Tensor: [N, T_head]
  """
  return torch.take_along_dim(
    torch.arange(x.shape[-1]).reshape(*[1] * (x.ndim - 1), -1),
    x.argsort(-1),
    -1
  )[..., :head]

"""
output, output_length = conformer_model(input, input_length)
top5 = head(output, head=5)
(top5[..., :1] != 0) * top5
"""

_ThreadID: TypeAlias = int

@__all__
class ThreadCUDA(ThreadPoolExecutor):

  def __init__(self, devices: Iterable[torch.device | int]):
    """
    ThreadCUDA クラスのコンストラクタ。

    Args:
        devices (Iterable[torch.device | int]): 使用する CUDA デバイスの ID または torch.device インスタンスのイテラブル。
    
    Raises:
        ValueError: devices が空の場合、ValueErrorが送出される。
    """

    self.device_stock = [torch.device(d) for d in devices]
    if not self.device_stock: raise ValueError(f"devices is empty.")

    self.threadID_device_map: dict[int, torch.device] = {}

    super().__init__(len(self.device_stock))
  
  def _threadID_to_device(self, threadID: _ThreadID):
    if threadID in self.threadID_device_map:
      device = self.threadID_device_map[threadID]
    else:
      device = self.threadID_device_map[threadID] = self.device_stock.pop(0)
    return device

  def map(
    self,
    func: Callable[Concatenate[torch.device, _P], _T],
    *iterables: Iterable, timeout: float | None = None, chunksize: int = 1
    ) -> Iterator[_T]:
    """
    与えられた関数を複数スレッドで並列実行し、結果のイテレータを返します。

    Args:
        func (Callable): スレッドで並列実行する関数
        *iterables (Iterable): 複数のイテラブルオブジェクト。イテラブルオブジェクトの要素が
            各スレッドに渡され、それらは引数としてfuncに渡されます。
            iterablesの長さが異なる場合、最短の長さに合わせて実行されます。
        timeout (float, optional): 各呼び出しのタイムアウト
            デフォルトはNoneで、タイムアウトしないことを示します。
        chunksize (int, optional): イテラブルオブジェクトからスレッドに渡す要素のバッチサイズ
            デフォルトは1で、1つずつスレッドに渡します。

    Returns:
        Iterator: 各呼び出しの結果を生成するイテレータ。

    Raises:
        TimeoutError: 指定されたタイムアウトが経過した場合に発生します。

    Examples:
        >>> def square(n: int) -> int:
        ...     return n * n
        ...
        >>> devices = [0, 1, 2]
        >>> with ThreadCUDA(devices) as pool:
        ...     results = pool.map(square, [1, 2, 3, 4, 5])
        ...
        >>> print(list(results))
        [1, 4, 9, 16, 25]
    """

    return super().map(
      (lambda *_args: func(self._threadID_to_device(get_ident()), *_args)),
      *iterables, timeout=timeout, chunksize=chunksize
    )
  
  def submit(
    self,
    func: Callable[Concatenate[torch.device, _P], _T],
    *args: _P.args, **kwargs: _P.kwargs
    ) -> Future[_T]:
    """
    指定された関数を非同期に実行するための`Future`オブジェクトを返す。

    Args:
        func (Callable[Concatenate[torch.device, _P], _T]):
            スレッドプールで非同期に実行する関数 
            関数の第1引数には、スレッドで使用する`torch.device`オブジェクトが渡されます。
        *args (_P.args):
            `func`に渡す位置引数
        **kwargs (_P.kwargs):
            `func`に渡すキーワード引数。

    Returns:
        Future[_T]:
            非同期処理の実行を表す`Future`オブジェクト。

    Example:
        >>> def power(device: torch.device, x: Tensor, e: Tensor) -> Tensor:
        ...     return data.to(device) ** e
        ...
        >>> with ThreadCUDA([0, 1]) as pool:
        ...     f1 = thread_cuda.submit(func, torch.tensor([0, 1, 2, 3, 4]))
        ...     f2 = thread_cuda.submit(func, torch.tensor([5, 6, 7, 8, 9]))
        ...
        >>> result1 = f1.result()
        >>> result2 = f2.result()
        >>> print(result1 + result2)
        tensor([1, 2, 3, 4, 5, 7, 8, 9, 10, 11])
    """

    return super().submit(
      (lambda *_args, **_kwargs: func(self._threadID_to_device(get_ident()),*_args, **_kwargs)),
      *args, **kwargs
    )
