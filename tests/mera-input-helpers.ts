/** Exercise visible day/time controls, never a hidden serialized input. */
export function chooseDateTime(
  screen: any,
  fireEvent: any,
  within: any,
  label: string,
  value: string,
  inputOnly = false,
) {
  const group = screen.getByRole("group", { name: label, exact: true }),
    controls = within(group);
  if (!controls.queryByLabelText("Date", { exact: true }))
    fireEvent.click(
      controls.getByRole("button", { name: "Choose another date" }),
    );
  const event = inputOnly ? fireEvent.input : fireEvent.change;
  event(controls.getByLabelText("Date", { exact: true }), {
    target: { value: value.split("T")[0] },
  });
  event(controls.getByLabelText("Preferred time", { exact: true }), {
    target: { value: value.split("T")[1] },
  });
}
export function readDateTime(screen: any, within: any, label: string) {
  const controls = within(
    screen.getByRole("group", { name: label, exact: true }),
  );
  const group = screen.getByRole("group", { name: label, exact: true });
  const selectedDay = Array.from(
    group.querySelectorAll('input[type="radio"]'),
  ).find(
    (input: any) => input.checked && /^\d{4}-\d{2}-\d{2}$/.test(input.value),
  ) as HTMLInputElement | undefined;
  const date =
      controls.queryByLabelText("Date", { exact: true })?.value ||
      selectedDay?.value ||
      "",
    time = controls.getByLabelText("Preferred time", { exact: true }).value;
  return date && time ? `${date}T${time}` : "";
}
