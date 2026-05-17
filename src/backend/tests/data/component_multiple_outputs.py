from px.custom import Component
from px.inputs.inputs import IntInput, MessageTextInput
from px.template.field.base import Output


class MultipleOutputsComponent(Component):
    inputs = [
        MessageTextInput(display_name="Input", name="input"),
        IntInput(display_name="Number", name="number"),
    ]
    outputs = [
        Output(
            display_name="Certain Output",
            name="certain_output",
            method="certain_output",
        ),
        Output(display_name="Other Output", name="other_output", method="other_output"),
    ]

    def certain_output(self) -> str:
        return f"This is my string input: {self.input}"

    def other_output(self) -> int:
        return f"This is my int input multiplied by 2: {self.number * 2}"
