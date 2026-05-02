from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "tontine", "status": "ok"})

# Create your views here.
