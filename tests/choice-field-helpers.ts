/** Exercise the visible radio/combobox UI while asserting the original stored option value. */
export function chooseField(
  screen: any,
  fireEvent: any,
  label: string,
  value: string,
) {
  const combo = screen.queryByRole("combobox", { name: label });
  if (combo) {
    fireEvent.focus(combo);
    const list = screen.getByRole("listbox", { name: `${label} options` });
    const option = Array.from(list.querySelectorAll('[role="option"]')).find(
      (node: any) => node.dataset.value === value,
    ) as HTMLElement | undefined;
    if (!option) throw Error(`Missing ${label} option ${value}`);
    fireEvent.click(option);
    return;
  }
  const group = screen.getByRole("group", { name: label });
  const radio = Array.from(group.querySelectorAll('input[type="radio"]')).find(
    (node: any) => node.value === value,
  ) as HTMLInputElement | undefined;
  if (!radio) throw Error(`Missing ${label} choice ${value}`);
  fireEvent.click(radio);
}
export function choiceValue(screen: any, label: string) {
  const group = screen.getByRole("group", { name: label });
  return group.querySelector("input:checked")?.value;
}
