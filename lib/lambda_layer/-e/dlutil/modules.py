from typing import Sequence, Iterator
import torch
import torch.nn as nn

from .others import _ALL

__all__ = _ALL()

@__all__
class conv_size(nn.Module):
  def __init__(
    self,
    kernel_size: int | Sequence[int],
    stride: int | Sequence[int] = 1,
    padding: int | Sequence[int] = 0,
    dimantion: int = None
    ):
    super().__init__()
  
    self._check_dimantion(dimantion, kernel_size, stride, padding)

    self.kernel_size = nn.Parameter(self._reform(self.dimantion, kernel_size), requires_grad=False)
    self.stride = nn.Parameter(self._reform(self.dimantion, stride), requires_grad=False)
    self.padding = nn.Parameter(self._reform(self.dimantion, padding), requires_grad=False)

  def _check_dimantion(self, dimantion: int | None, *args: int | Sequence[int]) -> bool:
    if dimantion == None:
      dimantion = max(len(t) if isinstance(t, Sequence) else 1 for t in args)
    err_idxs: list[int] = []
    for i, t in enumerate(args):
      if isinstance(t, Sequence) and len(t) != dimantion:
        err_idxs.append(i)
    if len(err_idxs) != 0:
      raise ValueError(f"dimantion of args[{', '.join(err_idxs)}] must be same to {dimantion}.")
    self.dimantion = dimantion
    return True

  def _reform(self, dimantion: int, target: int | Sequence[int]) -> torch.IntTensor:
    if isinstance(target, int):
      ret = [target] * dimantion
    elif isinstance(target, Sequence):
      ret = list(target)
    else:
      ret = [-1] * dimantion
    return torch.tensor(ret, dtype=torch.int32)

  def __repr__(self):
    return (f"conv_size{self.dimantion}D<"
              f"kernel_size: {self.kernel_size}, "
              f"stride: {self.stride}, "
              f"padding: {self.padding}"
            f">")

  def calc_shape(self, shape: int | Sequence[int], index: int = 0) -> int | torch.Size:

    if isinstance(shape, Sequence):
      shape = torch.tensor(shape, dtype=torch.int32)
      if len(shape) >= self.dimantion:
        print(shape[: -self.dimantion-1], shape[-self.dimantion-1:])
        return torch.Size(shape[: -self.dimantion -1]) + torch.Size((shape[-self.dimantion -1:] - self.kernel_size + 2 * self.padding).div(self.stride, rounding_mode="floor") + 1)
      else: raise ValueError(f"the lengths for shape must be same to {self.dimantion}")
    
    shape = int(shape)
    return int((shape - self.kernel_size[index] + 2 * self.padding[index]).div(self.stride[index], rounding_mode="floor") + 1)

  def calc_length(self, tensor: torch.Tensor, indices: int | Sequence[int] = None):
    # tensor: ([..., ]D)
    # D == len(indices)
    if indices == None:
      indices = list(range(self.dimantion))
    if not isinstance(indices, Sequence):
      indices = [indices] * tensor.shape[-1]
    return (tensor - self.kernel_size[indices] + 2 * self.padding[indices]).div(self.stride[indices], rounding_mode="floor") + 1

  forward = calc_length

@__all__
class conv_size_list(nn.ModuleList):
  def cs_modules(self) -> Iterator[conv_size]:
    return iter(self)

  def calc_shape(self, shape: int | Sequence[int], index: int = 0) -> int | torch.Size:
    for cs in self.cs_modules():
      shape = cs.calc_shape(shape, index=index)
    return shape

  def calc_length(self, tensor: torch.Tensor, indices: int | Sequence[int] = None):
    for cs in self:
      tensor = cs.calc_length(tensor, indices=indices)
    return tensor

  forward = calc_length