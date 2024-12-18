from src.ws.utils.rpc_registry import rpc_method
from src.apps.room.services import RoomStateService, ChatService, UserService
from src.apps.core.repositories.redis_repository import RedisRepository


repository = RedisRepository()
RoomStateManager = RoomStateService(repository)
RoomUserManager = UserService(repository)
RoomMessageManager = ChatService(repository)

@rpc_method
def get_initial_state(params):
    return {
        "success": True,
        "state": RoomStateManager.get_room_state(params["room_id"]),
        "users": list(RoomUserManager.get_users_in_room(params["room_id"])),
        "messages": RoomMessageManager.get_messages(params["room_id"]),
        "type": "initial_state",
    }


@rpc_method
def set_sync_state(params):
    """
    Set the synchronization state for the room.
    """
    current_state = RoomStateManager.get_room_state(params["room_id"])

    current_time = float(current_state.get("current_time", 0))
    new_time = float(params.get("current_time", 0))

    if (
        abs(current_time - new_time) > 0.5  
        or current_state.get("is_playing") != params["is_playing"] 
    ):
        RoomStateManager.set_room_state(params["room_id"], params)
        return {"success": True, "state": params, "type": "set_sync_state"}
    return {"success": True, "state": current_state, "type": "set_sync_state"}




@rpc_method
def get_sync_state(params):
    """
    get state
    """ 
    state = RoomStateManager.get_room_state(params["room_id"])
    return {
        "success": True,
        "state": state,
        "type": "get_sync_state",
    }


@rpc_method
def send_chat_message(params):
    RoomMessageManager.add_message(
        params["room_id"], params["username"], params["message"]
    )
    return {"success": True, "message": params["message"], "type": "chat_message"}


@rpc_method
def get_room_messages(params):
    return {
        "success": True,
        "messages": RoomMessageManager.get_messages(
            params["room_id"], params.get("limit", 50)
        ),
        "type": "get_room_messages",
    }
