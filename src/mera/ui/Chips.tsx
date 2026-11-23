import { Segmented, type ChoiceProps } from "./Segmented";
export function Chips(props: ChoiceProps) {
  return (
    <Segmented {...props} className={`mi-chips ${props.className || ""}`} />
  );
}
export default Chips;
