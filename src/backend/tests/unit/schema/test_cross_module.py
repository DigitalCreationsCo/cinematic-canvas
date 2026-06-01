"""Unit tests for cross-module isinstance functionality.

These tests verify that isinstance checks work correctly when classes are
re-exported from different modules (e.g., px.schema.Message vs portals.schema.Message).
"""

from portals.schema import Data as PortalsData
from portals.schema import Message as PortalsMessage
from px.schema.data import Data as PxData
from px.schema.message import Message as PxMessage


class TestDuckTypingData:
    """Tests for duck-typing Data class across module boundaries."""

    def test_px_data_isinstance_portals_data(self):
        """Test that px.Data instance is recognized as portals.Data."""
        px_data = PxData(data={"key": "value"})
        assert isinstance(px_data, PortalsData)

    def test_portals_data_isinstance_px_data(self):
        """Test that portals.Data instance is recognized as px.Data."""
        portals_data = PortalsData(data={"key": "value"})
        assert isinstance(portals_data, PxData)

    def test_data_equality_across_modules(self):
        """Test that Data objects from different modules are equal."""
        px_data = PxData(data={"key": "value"})
        portals_data = PortalsData(data={"key": "value"})
        assert px_data == portals_data

    def test_data_interchangeable_in_functions(self):
        """Test that Data from different modules work interchangeably."""

        def process_data(data: PortalsData) -> str:
            return data.get_text()

        px_data = PxData(data={"text": "hello"})
        # Should not raise type error
        result = process_data(px_data)
        assert result == "hello"

    def test_data_model_dump_compatible(self):
        """Test that model_dump works across module boundaries."""
        px_data = PxData(data={"key": "value"})
        portals_data = PortalsData(**px_data.model_dump())
        assert portals_data.data == {"key": "value"}


class TestDuckTypingMessage:
    """Tests for duck-typing Message class across module boundaries."""

    def test_px_message_isinstance_portals_message(self):
        """Test that px.Message instance is recognized as portals.Message."""
        px_message = PxMessage(text="hello")
        assert isinstance(px_message, PortalsMessage)

    def test_portals_message_isinstance_px_message(self):
        """Test that portals.Message instance is recognized as px.Message."""
        portals_message = PortalsMessage(text="hello")
        assert isinstance(portals_message, PxMessage)

    def test_message_equality_across_modules(self):
        """Test that Message objects from different modules are equal."""
        px_message = PxMessage(text="hello", sender="user")
        portals_message = PortalsMessage(text="hello", sender="user")
        # Note: Direct equality might not work due to timestamps
        assert px_message.text == portals_message.text
        assert px_message.sender == portals_message.sender

    def test_message_interchangeable_in_functions(self):
        """Test that Message from different modules work interchangeably."""

        def process_message(msg: PortalsMessage) -> str:
            return f"Processed: {msg.text}"

        px_message = PxMessage(text="hello")
        # Should not raise type error
        result = process_message(px_message)
        assert result == "Processed: hello"

    def test_message_model_dump_compatible(self):
        """Test that model_dump works across module boundaries."""
        px_message = PxMessage(text="hello", sender="user")
        dump = px_message.model_dump()
        portals_message = PortalsMessage(**dump)
        assert portals_message.text == "hello"
        assert portals_message.sender == "user"

    def test_message_inherits_data_duck_typing(self):
        """Test that Message inherits duck-typing from Data."""
        px_message = PxMessage(text="hello")
        # Should work as Data too
        assert isinstance(px_message, PortalsData)
        assert isinstance(px_message, PxData)


class TestDuckTypingWithInputs:
    """Tests for duck-typing with input validation."""

    def test_message_input_accepts_px_message(self):
        """Test that MessageInput accepts px.Message."""
        from px.inputs.inputs import MessageInput

        px_message = PxMessage(text="hello")
        msg_input = MessageInput(name="test", value=px_message)
        assert isinstance(msg_input.value, (PxMessage, PortalsMessage))

    def test_message_input_converts_cross_module(self):
        """Test that MessageInput handles cross-module Messages."""
        from px.inputs.inputs import MessageInput

        portals_message = PortalsMessage(text="hello")
        msg_input = MessageInput(name="test", value=portals_message)
        # Should recognize it as a Message
        assert msg_input.value.text == "hello"

    def test_data_input_accepts_px_data(self):
        """Test that DataInput accepts px.Data."""
        from px.inputs.inputs import DataInput

        px_data = PxData(data={"key": "value"})
        data_input = DataInput(name="test", value=px_data)
        assert data_input.value == px_data


class TestDuckTypingEdgeCases:
    """Tests for edge cases in cross-module isinstance checks."""

    def test_different_class_name_not_cross_module(self):
        """Test that objects with different class names are not recognized as cross-module compatible."""
        from px.schema.cross_module import CrossModuleModel

        class CustomModel(CrossModuleModel):
            value: str

        custom = CustomModel(value="test")
        # Should not be considered a Data
        assert not isinstance(custom, PxData)
        assert not isinstance(custom, PortalsData)

    def test_non_pydantic_model_not_cross_module(self):
        """Test that non-Pydantic objects are not recognized as cross-module compatible."""

        class FakeData:
            def __init__(self):
                self.data = {}

        fake = FakeData()
        assert not isinstance(fake, PxData)
        assert not isinstance(fake, PortalsData)

    def test_missing_fields_not_cross_module(self):
        """Test that objects missing required fields are not recognized as cross-module compatible."""
        from px.schema.cross_module import CrossModuleModel

        class PartialData(CrossModuleModel):
            text_key: str

        partial = PartialData(text_key="text")
        # Should not be considered a full Data (missing data field)
        assert not isinstance(partial, PxData)
        assert not isinstance(partial, PortalsData)


class TestDuckTypingInputMixin:
    """Tests for cross-module isinstance checks in BaseInputMixin and subclasses."""

    def test_base_input_mixin_is_cross_module(self):
        """Test that BaseInputMixin uses CrossModuleModel."""
        from px.inputs.input_mixin import BaseInputMixin
        from px.schema.cross_module import CrossModuleModel

        # Check that BaseInputMixin inherits from CrossModuleModel
        assert issubclass(BaseInputMixin, CrossModuleModel)

    def test_input_subclasses_inherit_cross_module(self):
        """Test that all input types inherit cross-module support."""
        from px.inputs.inputs import (
            BoolInput,
            DataInput,
            FloatInput,
            IntInput,
            MessageInput,
            StrInput,
        )
        from px.schema.cross_module import CrossModuleModel

        for input_class in [StrInput, IntInput, FloatInput, BoolInput, DataInput, MessageInput]:
            assert issubclass(input_class, CrossModuleModel)

    def test_input_instances_work_across_modules(self):
        """Test that input instances work with duck-typing."""
        from px.inputs.inputs import MessageInput

        # Create with px Message
        px_msg = PxMessage(text="hello")
        input1 = MessageInput(name="test1", value=px_msg)

        # Create with portals Message
        portals_msg = PortalsMessage(text="world")
        input2 = MessageInput(name="test2", value=portals_msg)

        # Both should work
        assert input1.value.text == "hello"
        assert input2.value.text == "world"
