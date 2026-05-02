from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})

# Create your views here.
