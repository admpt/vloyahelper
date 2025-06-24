from aiogram.fsm.state import State, StatesGroup

class TimeZoneSetup(StatesGroup):
    waiting_for_local_time = State()
