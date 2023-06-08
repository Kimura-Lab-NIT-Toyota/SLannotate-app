from tqdm import tqdm

from .others import _ALL

__all__ = _ALL()

@__all__
class my_tqdm(tqdm):
  def __iter__(self):
    """Backward-compatibility to use: for x in tqdm(iterable)"""

    # Inlining instance variables as locals (speed optimisation)
    iterable = self.iterable

    # If the bar is disabled, then just walk the iterable
    # (note: keep this check outside the loop for performance)
    if self.disable:
        for obj in iterable:
            yield obj
        return

    mininterval = self.mininterval
    last_print_t = self.last_print_t
    last_print_n = self.last_print_n
    min_start_t = self.start_t + self.delay
    n = self.n
    time = self._time

    try:
        for obj in iterable:
            yield obj
            # Update and possibly print the progressbar.
            # Note: does not call self.update(1) for speed optimisation.
            n += 1

            if n - last_print_n >= self.miniters:
                cur_t = time()
                dt = cur_t - last_print_t
                if dt >= mininterval and cur_t >= min_start_t:
                    self.update(n - last_print_n)
                    last_print_n = self.last_print_n
                    last_print_t = self.last_print_t
    finally:
        self.n = n