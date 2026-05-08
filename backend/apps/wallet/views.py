from django.http import JsonResponse
from django.contrib.auth import authenticate, get_user_model, login as auth_login
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.authn.serializers import RegisterSerializer

User = get_user_model()

def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})


@api_view(['POST'])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()

        return Response({"message": "Utilisateur créé",
                         "user": {
                             "user_id": user.id,
                             "numero_telepehone": user.email,
                             "code_pin": user.get_full_name(),
                         }
                         }, status=201)

    return Response(serializer.errors, status=400)


# Create your views here.
