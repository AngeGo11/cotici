from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "solidarity", "status": "ok"})



def create_solidarity_tontine(request):
    user= request.user

# Create your views here.
