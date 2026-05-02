from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "authn", "status": "ok"})

# Create your views here.
