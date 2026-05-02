from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "solidarity", "status": "ok"})

# Create your views here.
